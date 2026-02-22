import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { evaluateMajorProgress, listMajors, loadRequirements } from "./majorProgress.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/data", express.static(path.join(__dirname, "data")));

const requirementsPath = path.join(__dirname, "data", "normalized", "MajorSpecificRequirements.JSON");

app.get("/api/majors", (_req, res) => {
  try {
    const requirements = loadRequirements(requirementsPath);
    res.json({ majors: listMajors(requirements) });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/major-progress", (req, res) => {
  try {
    const { major, degreeType, studentCourses } = req.body ?? {};
    if (!major || !Array.isArray(studentCourses)) {
      return res.status(400).json({ error: "major and studentCourses[] are required" });
    }

    const requirements = loadRequirements(requirementsPath);
    const result = evaluateMajorProgress(requirements, major, degreeType, studentCourses);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.listen(8000, () => console.log("Backend running on http://localhost:8000"));