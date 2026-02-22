import DegreePlannerFrontend from "./DegreePlannerFrontend";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AILlamaPage from "./AILlamaPage";
export default function App() {
  return <Router>
      <Routes>
        {/* Main Degree Planner Page */}
        <Route path="/" element={<DegreePlannerFrontend />} />
        
        {/* New AI Model Page */}
        <Route path="/ai-advisor" element={<AILlamaPage />} />
      </Routes>
    </Router>
}
