import path from "path";
import swaggerJSDoc from "swagger-jsdoc";

const isProd = false;
// const isProd = process.env.NODE_ENV === "production";

// IMPORTANT: resolve from current file location after build
const routesGlob = isProd
  ? path.join(process.cwd(), "dist", "routes", "**", "*.js")
  : path.join(process.cwd(), "src", "routes", "**", "*.ts");

const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: { title: "User Service API", version: "1.0.0" },
    servers: [{ url: "http://localhost:4000" }],
  },
  apis: [routesGlob],
});

export default swaggerSpec;