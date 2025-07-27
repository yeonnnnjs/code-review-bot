const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

let appOctokit;
let octokit;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.get('/', (req, res) => {
  res.send('Webhook endpoint is alive.');
});

router.post('/', async (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  console.log(`Received a ${event} event`);

  if (
      event === 'pull_request' &&
      (payload.action === 'opened' || payload.action === 'synchronize')
  ) {
    const pr = payload.pull_request;
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const prNumber = pr.number;

    try {
      if (!appOctokit) {
        const { Octokit } = await import('octokit');
        const { createAppAuth } = await import('@octokit/auth-app');

        appOctokit = new Octokit({
          authStrategy: createAppAuth,
          auth: {
            appId: process.env.APP_ID,
            privateKey: process.env.PRIVATE_KEY,
          },
        });
      }

      const installationId = payload.installation.id;
      const { token } = await appOctokit.auth({
        type: 'installation',
        installationId,
      });

      const { Octokit } = await import('octokit');
      octokit = new Octokit({ auth: token });

      const { data: pullRequestDiff } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: { format: 'diff' },
      });

      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `Please review the following code changes:\n${pullRequestDiff}`;
      const result = await model.generateContent(prompt);
      const review = await result.response.text();

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: review,
      });

      console.log(`Comment posted to PR #${prNumber}`);
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).send('Webhook processing failed.');
    }
  }

  res.status(200).send('OK');
});

module.exports = router;