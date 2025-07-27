
const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// This should be replaced with your actual GitHub App authentication
const { Octokit } = require('octokit');
const { createAppAuth } = require("@octokit/auth-app");

// Initialize Octokit with App authentication
const appOctokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: process.env.APP_ID,
    privateKey: process.env.PRIVATE_KEY,
  },
});

// This will be the installation Octokit instance
let octokit;

// This should be replaced with your actual Gemini API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateReview(diff) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});
  const prompt = `
    Please review the following code changes and provide feedback.
    Focus on potential bugs, performance issues, style violations, and areas for improvement.
    
    **Changed Code (diff format):**
    ${diff}
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error('Error generating review:', error.message, error.stack);
    return 'Error: Could not generate code review.';
  }
}

async function postReviewComment(owner, repo, prNumber, comment) {
  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: comment,
    });
    console.log(`Successfully posted a comment on PR #${prNumber}`);
  } catch (error) {
    console.error(`Error posting comment on PR #${prNumber}:`, error);
  }
}

/* POST github webhook. */
router.post('/', async (req, res, next) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  console.log(`Received a ${event} event`);

  if (event === 'pull_request' && (payload.action === 'opened' || payload.action === 'synchronize')) {
    const pr = payload.pull_request;
    const diffUrl = pr.diff_url;
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const prNumber = pr.number;

    console.log(`Fetching diff from: ${diffUrl}`);

    try {
      const installationId = payload.installation.id;
      const { token } = await appOctokit.auth({
        type: "installation",
        installationId: installationId,
      });
      octokit = new Octokit({ auth: token });
      console.log(`Authorization header for diff request: Bearer ${token.substring(0, 10)}...`); // Log first 10 chars of token

      const { data: pullRequest } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: {
          format: "diff",
        },
      });
      const diff = pullRequest;
      console.log('--- PR Diff ---');
      console.log(diff);
      console.log('--- End of PR Diff ---');

      const review = await generateReview(diff);
      console.log('--- Generated Review ---');
      console.log(review);
      console.log('--- End of Generated Review ---');

      await postReviewComment(owner, repo, prNumber, review);

    } catch (error) {
      console.error('Error processing webhook:', error);
      return res.status(500).send('Error processing webhook');
    }
  }

  res.status(200).send('OK');
});

module.exports = router;
