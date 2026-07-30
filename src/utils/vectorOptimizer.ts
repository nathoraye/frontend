export const optimizeForTracer = async (rawImageData: ImageData, scale: number = 2): Promise<ImageData> => {
    return new Promise((resolve) => {
        // 1. Mount original raw pixel data
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = rawImageData.width;
        srcCanvas.height = rawImageData.height;
        const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
        if (!srcCtx) return resolve(rawImageData);
        srcCtx.putImageData(rawImageData, 0, 0);

        // 2. Initialize Super-Sample Canvas
        const upCanvas = document.createElement('canvas');
        upCanvas.width = rawImageData.width * scale;
        upCanvas.height = rawImageData.height * scale;
        const upCtx = upCanvas.getContext('2d', { willReadFrequently: true });
        if (!upCtx) return resolve(rawImageData);

        // 3. Hardware Anti-Aliasing (Melts the rigid pixel stairs into smooth gradients)
        upCtx.imageSmoothingEnabled = true;
        upCtx.imageSmoothingQuality = 'high';
        upCtx.drawImage(srcCanvas, 0, 0, upCanvas.width, upCanvas.height);

        // 4. Mathematical Curve Forcing (Binary Thresholding)
        // This crushes the smooth gradients into a razor-sharp, curved cut-path boundary
        const upData = upCtx.getImageData(0, 0, upCanvas.width, upCanvas.height);
        const data = upData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            
            // Strict threshold: If it's a semi-transparent gradient edge, clear it
            if (alpha < 128) {
                data[i + 3] = 0; 
            } else {
                // If it's core shape mass, force it to pure black for the tracer
                data[i] = 0;       // R
                data[i + 1] = 0;   // G
                data[i + 2] = 0;   // B
                data[i + 3] = 255; // A
            }
        }
        
        upCtx.putImageData(upData, 0, 0);
        resolve(upData);
    });
};