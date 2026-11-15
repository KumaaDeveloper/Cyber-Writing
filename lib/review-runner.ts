type ReviewInput = { title: string; theme_title?: string; references: unknown[]; pages: { id: string; title: string; blocks: unknown }[] };
export function reviewInputUnchanged(before: ReviewInput, after: ReviewInput, pageId: string) {
  const input = (doc: ReviewInput) => ({ title: doc.title, theme: doc.theme_title, references: doc.references, page: doc.pages.find((page) => page.id === pageId) });
  return after.pages.some((page) => page.id === pageId) && JSON.stringify(input(before)) === JSON.stringify(input(after));
}

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
