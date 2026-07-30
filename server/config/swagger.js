// File: server/config/swagger.js
import swaggerJSDoc from "swagger-jsdoc";

export const swaggerDocument = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Lumina Chat API",
      version: "1.0.0",
      description: "REST API for authentication, realtime chats, friends, stories, calls and administration.",
    },
    servers: [{ url: "/api" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./server/routes/*.js"],
});
