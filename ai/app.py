from flask import Flask, request, jsonify
from flask_cors import CORS
import runModel # Imports your existing runModel.py script

app = Flask(__name__)
CORS(app) # Allows React running on localhost:5173 to talk to Flask on localhost:5000

@app.route('/api/ask', methods=['POST'])
def ask_llama():
    data = request.json
    user_prompt = data.get('prompt', '')
    
    # Pass the prompt to your locally deployed model logic
    # Example: model_response = runModel.generate_response(user_prompt)
    model_response = f"Llama model says: {user_prompt}" 
    
    return jsonify({"answer": model_response})

if __name__ == '__main__':
    app.run(port=5000)