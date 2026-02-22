import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";



export default function AILlamaPage() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // 1. Fetch relevant context from your Convex backend
  // Adjust these queries based on your actual Convex schema/API
  //const userProgress = useQuery(api.tasks.getUserProgress); 
  const majorReqs = useQuery(api.tasks.getMajorReqs);
  console.log(majorReqs);
  console.log("by now");
  
  // Example placeholder for context:
  const studentContext = "Student is a Computer Science major. They have taken CS 200 and CS 300. They need to fulfill their science requirements.";

  const handleAskAI = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        // 2. Send both the user's question AND the Convex context to Python
        body: JSON.stringify({ 
            prompt: prompt,
            context: studentContext // Pass the data from Convex here
        })
      });
      
      const data = await res.json();
      setResponse(data.answer); 
    } catch (err) {
      console.error(err);
      setResponse("Error connecting to the local Llama model.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="p-8 max-w-4xl mx-auto font-sans">
      <button 
        onClick={() => navigate("/")}
        className="mb-6 text-blue-600 hover:underline flex items-center gap-2"
      >
        &larr; Back to Degree Planner
      </button>
      
      <h1 className="text-3xl font-bold mb-6 text-gray-800">AI Academic Advisor</h1>
      
      <div className="flex flex-col gap-4">
        <textarea 
          className="w-full p-4 border border-gray-300 rounded-lg shadow-sm h-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ask the Llama AI about courses, scheduling, or degree requirements..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        
        <button 
          onClick={handleAskAI}
          disabled={loading || !prompt}
          className="bg-blue-600 text-white px-6 py-2 rounded font-semibold disabled:bg-gray-400 self-end transition-colors hover:bg-blue-700"
        >
          {loading ? "Thinking..." : "Ask AI"}
        </button>

        {response && (
          <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-lg whitespace-pre-wrap text-gray-800">
            <h2 className="text-xl font-semibold mb-2 text-gray-900">Response:</h2>
            <p>{response}</p>
          </div>
        )}
      </div>
    </div>
  );
}