export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === "docs.wolin.id") {
    const targetPath = url.pathname === "/" ? "/docs" : url.pathname;
    return Response.redirect(`https://wolin.id${targetPath}${url.search}`, 301);
  }
  return context.next();
}
