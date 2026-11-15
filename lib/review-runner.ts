export async function checkPages(
  pages: { id: string }[],
  request: (pageId: string) => Promise<{ items: any[] }>,
  onResult: (items: any[]) => void,
  onProgress: (current: number, total: number) => void,
) {
  for (let index = 0; index < pages.length; index++) {
    onProgress(index + 1, pages.length);
    try {
      const result = await request(pages[index].id);
      onResult(result.items);
    } catch (error) {
      throw new Error(`Halaman ${index + 1}: ${error instanceof Error ? error.message : "Pemeriksaan gagal. Coba kembali."}`);
    }
  }
}
