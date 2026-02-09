/**
 * Upload a file via POST with upload progress (0-100).
 * Uses XMLHttpRequest so we can listen to upload.onprogress.
 * Returns the JSON response body on success; throws on failure or non-2xx.
 */
export function uploadWithProgress(
  url: string,
  file: File,
  options: {
    credentials?: RequestCredentials;
    onProgress?: (percent: number) => void;
  } = {}
): Promise<{ success: boolean; url?: string; message?: string }> {
  const { credentials = 'same-origin', onProgress } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(Math.min(100, percent));
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const body = JSON.parse(xhr.responseText || '{}') as { success?: boolean; url?: string; message?: string };
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ success: body.success === true, url: body.url, message: body.message });
        } else {
          reject(new Error(body.message || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error('Invalid response'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('POST', url);
    if (credentials === 'include') {
      xhr.withCredentials = true;
    }
    xhr.send(form);
  });
}
