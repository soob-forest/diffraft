export async function showSummary() {
  const mode = $("button=변경 검토");
  if ((await mode.getAttribute("aria-pressed")) !== "true") await mode.click();
  const tab = $(".panel-tabs").$("button=변경 상세");
  if (await tab.isDisplayed()) await tab.click();
  const comment = $(".comment-form:not([hidden]) .workflow-back");
  if (await comment.isDisplayed()) await comment.click();
  const workflow = $(".proposal-workflow:not([hidden]) .workflow-back");
  if (await workflow.isDisplayed()) await workflow.click();
  // Regeneration returns through the comment view.
  if (await comment.isDisplayed()) await comment.click();
}

export async function openComment() {
  if (await $(".comment-form:not([hidden])").isDisplayed()) return;
  await showSummary();
  await $("button=코멘트 작성").click();
  await $(".comment-form:not([hidden]) textarea").waitForDisplayed();
}

export async function openCandidate() {
  await showSummary();
  await $("button=직접 후보 수정").click();
  await $(".candidate-form textarea").waitForDisplayed();
}

export async function openRegenerate() {
  await showSummary();
  await $("button=이 변경 다시 제안").click();
  await $(".regenerate-form textarea").waitForDisplayed();
}

export async function chooseGroup(number) {
  await showSummary();
  const sidebar = $(".sidebar");
  let restore = false;
  if (!(await sidebar.isDisplayed())) {
    await $("button=문서 목록").click();
    restore = true;
  }
  const navigation = $(".navigation-more");
  if ((await navigation.getAttribute("open")) === null)
    await navigation.$("summary").click();
  await $(`button=${number}번 변경`).click();
  await navigation.$("summary").click();
  if (restore) await $("button=문서 목록").click();
}

export async function openDocumentMenu() {
  const menu = $(".document-menu");
  if ((await menu.getAttribute("open")) === null)
    await menu.$("summary").click();
}

export async function saveDocument() {
  await openDocumentMenu();
  await $("button=저장").click();
  await $(".document-menu > summary").click();
}

export async function openScope() {
  if (!(await $(".scope-editor").isDisplayed()))
    await $(".scope-heading button").click();
}

export async function openReviewOptions() {
  await showSummary();
  const options = $(".review-task-options");
  if ((await options.getAttribute("open")) === null)
    await options.$("summary").click();
}
