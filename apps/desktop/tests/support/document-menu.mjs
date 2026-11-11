export async function documentAction(title, action) {
  await $(`.document-more[aria-label="${title} 문서 작업"]`).click();
  await $(".document-actions-menu").$(`button=${action}`).click();
}
