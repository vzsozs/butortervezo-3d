// src/three/PDFExportManager.ts
import jsPDF from 'jspdf';
import { useExperienceStore } from '@/stores/experience';
import { useConfigStore } from '@/stores/config';

export class PDFExportManager {

  public async generateOfferPDF() {
    const experienceStore = useExperienceStore();
    const configStore = useConfigStore();
    const doc = new jsPDF();

    console.log("[PDF Export] PDF generálás elindítva...");

    // --- 1. Fejléc és Logó ---
    // A logót be kell importálni vagy URL-ről betölteni.
    // Cseréld le a '/logo.png' elérési utat a sajátodra!
    try {
      // A logó betöltése aszinkron, ezért Promise-t használunk
      const logoDataUrl = await this.getImageDataUrl('/logo.png');
      doc.addImage(logoDataUrl, 'PNG', 15, 10, 40, 15);
    } catch (error) {
      console.warn("[PDF Export] Logó nem található, kihagyva.", error);
      doc.setFontSize(10);
      doc.text("Az Ön Cége", 15, 20);
    }
    
    doc.setFontSize(22);
    doc.text("Konyhaterv - Árajánlat", 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Dátum: ${new Date().toLocaleDateString('hu-HU')}`, 105, 30, { align: 'center' });

    // --- 2. Tételek táblázat ---
    const tableData: (string | number)[][] = [];
    const headers = [['Mennyiség', 'Megnevezés', 'Egységár', 'Összesen']];

    for (const furniture of experienceStore.placedObjects) {
      if (!furniture.userData.config || !furniture.userData.componentState) continue;
      const furnitureConfig = configStore.getFurnitureById(furniture.userData.config.id);
      if (furnitureConfig?.price) {
        tableData.push(['1 db', furnitureConfig.name, this.formatCurrency(furnitureConfig.price), this.formatCurrency(furnitureConfig.price)]);
      }
      const componentState = furniture.userData.componentState;
      for (const slotId in componentState) {
        const componentId = componentState[slotId];
        if (componentId) {
          const componentConfig = configStore.getComponentById(componentId);
          if (componentConfig?.price) {
            const slotConfig = furnitureConfig?.slots.find(s => s.id === slotId);
            const quantity = slotConfig?.attachmentPoints?.length || 1;
            tableData.push([`${quantity} db`, componentConfig.name, this.formatCurrency(componentConfig.price), this.formatCurrency(componentConfig.price * quantity)]);
          }
        }
      }
    }

    doc.setFontSize(10);
    let startY = 50;
    const pageHeight = doc.internal.pageSize.height;

    const printHeaders = () => {
      doc.setFont('helvetica', 'bold');
      const headerRow = headers[0];
      if (headerRow) {
        doc.text(headerRow[0] || '', 20, startY);
        doc.text(headerRow[1] || '', 50, startY);
        doc.text(headerRow[2] || '', 140, startY, { align: 'right' });
        doc.text(headerRow[3] || '', 190, startY, { align: 'right' });
      }
      startY += 7;
      doc.line(15, startY - 5, 195, startY - 5);
      doc.setFont('helvetica', 'normal');
    };

    printHeaders();

    tableData.forEach(row => {
      // Oldaltörés, ha szükséges
      if (startY > pageHeight - 30) {
        doc.addPage();
        startY = 20;
        printHeaders();
      }
      doc.text(String(row[0] || ''), 20, startY);
      doc.text(String(row[1] || ''), 50, startY);
      doc.text(String(row[2] || ''), 140, startY, { align: 'right' });
      doc.text(String(row[3] || ''), 190, startY, { align: 'right' });
      startY += 7;
    });

    // --- 3. Végösszeg ---
    if (startY > pageHeight - 40) { // Ellenőrizzük, van-e hely a végösszegnek
      doc.addPage();
      startY = 30;
    }
    startY += 10;
    doc.line(120, startY, 195, startY);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text("Teljes összeg:", 120, startY + 7);
    doc.text(this.formatCurrency(experienceStore.totalPrice), 190, startY + 7, { align: 'right' });

    // --- 4. Látványterv (Screenshot) ---
    const screenshotCanvas = experienceStore.instance?.getScreenshotCanvas();
    
    console.log(`[PDF Export] Screenshot canvas fogadva. Típus: ${typeof screenshotCanvas}`);

    if (screenshotCanvas) {
      doc.addPage();
      doc.setFontSize(16);
      doc.text("Látványterv", 105, 20, { align: 'center' });
      
      // === JAVÍTÁS: A CANVAS ÁTADÁSA ===
      // A jsPDF felismeri a canvas elemet, és a 'CANVAS' formátumot használja
      doc.addImage(screenshotCanvas, 'CANVAS', 15, 30, 180, 101.25);
      
      console.log("[PDF Export] Screenshot hozzáadva a PDF-hez (canvas alapján).");
    } else {
      console.warn("[PDF Export] A screenshot canvas érvénytelen, kihagyva.");
    }

    // --- 5. Fájl mentése ---
    const pdfBlob = doc.output('blob');
    const suggestedName = `ajanlat_${new Date().toISOString().slice(0, 10)}.pdf`;

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{ description: 'PDF Dokumentum', accept: { 'application/pdf': ['.pdf'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(pdfBlob);
        await writable.close();
        console.log("[PDF Export] PDF sikeresen elmentve (modern API).");
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.log("[PDF Export] A felhasználó megszakította a mentést.");
          return;
        }
      }
    }

    doc.save(suggestedName);
    console.log("[PDF Export] PDF generálás befejezve (fallback).");
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(value);
  }

  // Segédfüggvény a képek aszinkron betöltéséhez
  private getImageDataUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  }
}