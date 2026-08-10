import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

/**
 * Server functions are same-origin RPC endpoints. Without this, any website a
 * signed-in user visits could POST to them from the user's browser — which for
 * `askAssistant` means spending our OpenRouter credit, and for anything added
 * later could mean writing data. The filter limits the check to server
 * functions so normal document requests are untouched.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  // CSRF first: reject forged requests before any handler work happens.
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
