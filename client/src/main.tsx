import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';
import 'regenerator-runtime/runtime';

// React imports
import { createRoot } from "react-dom/client";
import App from "./App";

// Import our app CSS last to ensure proper styling cascade
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);