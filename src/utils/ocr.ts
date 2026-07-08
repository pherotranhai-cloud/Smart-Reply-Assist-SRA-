export const processOcrOffline = async (imageFileOrBase64: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if ((window as any).Tesseract) {
      runOcr((window as any).Tesseract, imageFileOrBase64).then(resolve).catch(reject);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => {
      runOcr((window as any).Tesseract, imageFileOrBase64).then(resolve).catch(reject);
    };
    script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
    document.body.appendChild(script);
  });
};

const runOcr = async (Tesseract: any, image: string) => {
  const worker = await Tesseract.createWorker('chi_sim+eng+vie');
  const { data: { text } } = await worker.recognize(image);
  await worker.terminate();
  return text;
};
