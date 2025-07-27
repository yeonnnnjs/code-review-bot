require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"}); 

  try {
    const prompt = "Hello, Gemini!";
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log("Gemini API Test Success:", text);
  } catch (error) {
    console.error("Gemini API Test Failed:", error.message);
    console.error(error.stack);
  }
}

testGemini();
