// src/types.d.ts

// Ezzel a 'declare global' blokkal kiterjesztjük a globális 'Window' interfészt
declare global {
  interface Window {
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  }

  interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: {
      description?: string;
      accept?: Record<string, string[]>;
    }[];
  }

  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: Blob | string): Promise<void>;
    close(): Promise<void>;
  }
}

// Ez az üres 'export {}' sor biztosítja, hogy a fájlt modulként kezelje a TypeScript.
export {};