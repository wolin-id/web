export async function onRequest(context) {
  const { request } = context;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, DPoP",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (method === "GET") {
    return new Response(
      JSON.stringify(
        {
          name: "wolin-mcp",
          transport: "streamable-http",
          endpoint: "https://wolin.id/mcp",
          per_pod_endpoint: "https://{handle}.wolin.id/mcp",
          docs: "https://wolin.id/docs",
          llms_txt: "https://wolin.id/llms.txt",
          usage: "Send JSON-RPC 2.0 POST requests (initialize, tools/list, tools/call) to https://wolin.id/mcp or your personal Pod at https://{handle}.wolin.id/mcp.",
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  if (method === "POST") {
    const upstreamHeaders = new Headers();
    for (const key of ["content-type", "accept", "authorization", "dpop", "mcp-session-id"]) {
      const val = request.headers.get(key);
      if (val) upstreamHeaders.set(key, val);
    }
    const body = await request.arrayBuffer();
    const upstreamRes = await fetch("https://pod.wolin.id/mcp", {
      method: "POST",
      headers: upstreamHeaders,
      body,
    });
    const outHeaders = new Headers(upstreamRes.headers);
    outHeaders.set("Access-Control-Allow-Origin", "*");
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: outHeaders,
    });
  }

  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: {
      "Allow": "GET, POST, OPTIONS",
      "Content-Type": "application/json",
    },
  });
}
