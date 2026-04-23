'use client';

import { useRef, useCallback, useState } from 'react';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

interface UsePdfExportOptions {
    title?: string;
    pageSize?: 'A4' | 'A3';
    orientation?: 'portrait' | 'landscape';
    margin?: string;
    allowSVG?: boolean;
    fitToWidth?: boolean;
    fitToWidthMinScale?: number;
}

export function usePdfExport(options: UsePdfExportOptions = {}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);

    const exportToPdf = useCallback(async () => {
        if (!containerRef.current || isExporting) return;

        setIsExporting(true);
        const element = containerRef.current;
        const scrollContainer = (element.querySelector('[data-pdf-scroll-container]') || element.querySelector('.overflow-auto')) as HTMLElement | null;
        const originalId = element.id;

        // Store original styles
        const originalStyles = {
            height: element.style.height,
            overflow: element.style.overflow,
            scrollHeight: scrollContainer?.style.height,
            scrollOverflow: scrollContainer?.style.overflow,
            scrollOverflowX: scrollContainer?.style.overflowX,
            scrollOverflowY: scrollContainer?.style.overflowY,
            scrollPosition: scrollContainer?.style.position,
            scrollBarWidth: scrollContainer?.style.getPropertyValue('scrollbar-width')
        };

        try {
            // Expand content for full capture
            element.style.height = 'auto';
            element.style.overflow = 'visible';
            if (scrollContainer) {
                scrollContainer.style.height = 'auto';
                scrollContainer.style.overflow = 'visible';
                scrollContainer.style.overflowX = 'visible';
                scrollContainer.style.overflowY = 'visible';
                scrollContainer.style.position = 'relative';
                scrollContainer.style.setProperty('scrollbar-width', 'none');
            }

            // Force synchronous layout calc to get accurate dimensions after expanding
            const contentWidth = scrollContainer ? scrollContainer.scrollWidth : element.scrollWidth;
            const contentHeight = element.scrollHeight;

            // Give the browser a tiny moment to flush DOM updates
            await new Promise(resolve => setTimeout(resolve, 300));

            // Generate Canvas image using html-to-image (supports Tailwind v4 lab/oklch colors natively)
            const dataUrl = await toJpeg(element, {
                quality: 0.8, // 80% JPEG takes significantly less space and time than PNG
                pixelRatio: 1.0, // Normal scale prevents memory explosion
                width: contentWidth,
                height: contentHeight,
                backgroundColor: '#ffffff',
                cacheBust: true,
                skipFonts: true, // Fixes "Cannot access rules" CORS error on external stylesheets
                fontEmbedCSS: '',
                filter: (node) => {
                    if (node.nodeType !== 1) return true; // keep text nodes
                    const el = node as HTMLElement;
                    if (el.tagName === 'BUTTON') return false;
                    if (el.classList?.contains('print-hide')) return false;
                    if (el.classList?.contains('print-hide-bg')) return false;
                    if (el.classList?.contains('column-menu-trigger')) return false;
                    if (!options.allowSVG && el.tagName?.toLowerCase() === 'svg' && !el.classList?.contains('lucide')) {
                        return false;
                    }
                    return true;
                }
            });

            // Convert px to mm: 1px = ~0.264583 mm
            const pxToMm = 0.264583;
            // Add a small 10mm padding to the pdf dimensions
            const pdfWidth = (contentWidth * pxToMm) + 20;
            const pdfHeight = (contentHeight * pxToMm) + 20;

            const pdf = new jsPDF({
                orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
                unit: 'mm',
                format: [pdfWidth, Math.max(pdfHeight, 210)] // Ensure height is at least typical A4 width
            });

            // Add image centered inside the 10mm margins (FAST compression flag for large pdf generation speed)
            pdf.addImage(dataUrl, 'JPEG', 10, 10, contentWidth * pxToMm, contentHeight * pxToMm, undefined, 'FAST');

            const filename = `${options.title || 'gantt_export'}_${new Date().getTime()}.pdf`;
            pdf.save(filename);

        } catch (error) {
            console.error('PDF export failed:', error);
        } finally {
            // Restore original styles
            element.style.height = originalStyles.height;
            element.style.overflow = originalStyles.overflow;
            element.id = originalId;

            if (scrollContainer) {
                scrollContainer.style.height = originalStyles.scrollHeight || '';
                scrollContainer.style.overflow = originalStyles.scrollOverflow || '';
                scrollContainer.style.overflowX = originalStyles.scrollOverflowX || '';
                scrollContainer.style.overflowY = originalStyles.scrollOverflowY || '';
                scrollContainer.style.position = originalStyles.scrollPosition || '';
                scrollContainer.style.setProperty('scrollbar-width', originalStyles.scrollBarWidth || '');
            }
            setIsExporting(false);
        }
    }, [options.title, options.allowSVG, isExporting]);

    return {
        containerRef,
        exportToPdf,
        isPdfExporting: isExporting
    };
}

export default usePdfExport;
