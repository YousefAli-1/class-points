import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <main className="bg-mint min-h-dvh">
      <h1>Class Points</h1>
    </main>
  </StrictMode>,
);
