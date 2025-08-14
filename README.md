# forms-audit-api

Core delivery platform Node.js Backend Template.

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Local development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Testing](#testing)
  - [Production](#production)
  - [Npm scripts](#npm-scripts)
  - [Update dependencies](#update-dependencies)
  - [Formatting](#formatting)
    - [Windows prettier issue](#windows-prettier-issue)
- [API endpoints](#api-endpoints)
- [Development helpers](#development-helpers)
  - [MongoDB Locks](#mongodb-locks)
  - [Proxy](#proxy)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Docker Compose](#docker-compose)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Requirements

### Node.js

Please install [Node.js](http://nodejs.org/) `>= v22` and [npm](https://nodejs.org/) `>= v11`. You will find it
easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd forms-audit-api
nvm use
```

## Local development

### Setup

1. Install Docker

2. Bring up runtime dependencies

```bash
docker compose up
```

3. Create a `.env` file with the following mandatory environment variables populated at root level:

```text
MONGO_URI='mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'
FORMS_AUDIT_QUEUE='forms_audit_events'
LOG_LEVEL=debug
SQS_ENDPOINT=http://localhost:4566
AWS_REGION=eu-west-2
EVENTS_SQS_QUEUE_URL=http://sqs.eu-west-2.127.0.0.1:4566/000000000000/forms_audit_events
AWS_ACCESS_KEY_ID=dummy
AWS_SECRET_ACCESS_KEY=dummy
RECEIVE_MESSAGE_TIMEOUT_MS=30000
SQS_MAX_NUMBER_OF_MESSAGES=10
SQS_VISIBILITY_TIMEOUT=30
ENTITLEMENT_URL=http://localhost:3004
```

For proxy options, see https://www.npmjs.com/package/proxy-from-env which is used by https://github.com/TooTallNate/proxy-agents/tree/main/packages/proxy-agent. It's currently supports Hapi Wreck only, e.g. in the JWKS lookup.

### Development

Install application dependencies:

```bash
npm install
```

To run the application in `development` mode run:

```bash
npm run dev
```

### Testing

To test the application run:

```bash
npm run test
```

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

### Notes on SQS queue configuration

`ReceiveMessageWaitTime` - this is probably the most important queue setting and controls what amazon call long polling vs short polling. When `ReceiveMessageWaitTime` is greater than 0, long polling is in effect. The max `ReceiveMessageWaitTime` is 20s.

This is the code affect by this setting:

```js
export function receiveEventMessages() {
  const command = new ReceiveMessageCommand(input)
  return sqsClient.send(command)
}
```

With short-polling, line 3 fetches any messages from SQS and yields immediately.

With long-polling, if there aren’t any messages found, the HTTP connection is kept open for up to 20s until some arrive. The consumer of receiveEventMessages is left waiting while that happens.

By default, CDP set `ReceiveMessageWaitTime` to 20s. The auditing queue also uses this default.

See [here](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html) for more information.

#### Queue configuration in forms-audit-api

`RECEIVE_MESSAGE_TIMEOUT_MS` - the amount of time to wait between calls to receive messages

`SQS_MAX_NUMBER_OF_MESSAGES` - the number of messages to receive at once (max 10)

`SQS_VISIBILITY_TIMEOUT` - when receiving a message from an Amazon SQS queue, it remains in the queue but becomes temporarily invisible to other consumers. This invisibility is controlled by the visibility timeout, which ensures that other consumers cannot process the same message while you are working on it.

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json).
To view them in your command line run:

```bash
npm run
```

### Update dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

### Formatting

#### Windows prettier issue

If you are having issues with formatting of line breaks on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

## API endpoints

| Endpoint             | Description                    |
| :------------------- | :----------------------------- |
| `GET: /health`       | Health                         |
| `GET: /example    `  | Example API (remove as needed) |
| `GET: /example/<id>` | Example API (remove as needed) |

## Development helpers

### MongoDB Locks

If you require a write lock for Mongo you can acquire it via `server.locker` or `request.locker`:

```javascript
async function doStuff(server) {
  const lock = await server.locker.lock('unique-resource-name')

  if (!lock) {
    // Lock unavailable
    return
  }

  try {
    // do stuff
  } finally {
    await lock.free()
  }
}
```

Keep it small and atomic.

You may use **using** for the lock resource management.
Note test coverage reports do not like that syntax.

```javascript
async function doStuff(server) {
  await using lock = await server.locker.lock('unique-resource-name')

  if (!lock) {
    // Lock unavailable
    return
  }

  // do stuff

  // lock automatically released
}
```

Helper methods are also available in `/src/helpers/mongo-lock.js`.

### Proxy

We are using forward-proxy which is set up by default. To make use of this: `import { fetch } from 'undici'` then
because of the `setGlobalDispatcher(new ProxyAgent(proxyUrl))` calls will use the ProxyAgent Dispatcher

If you are not using Wreck, Axios or Undici or a similar http that uses `Request`. Then you may have to provide the
proxy dispatcher:

To add the dispatcher to your own client:

```javascript
import { ProxyAgent } from 'undici'

return await fetch(url, {
  dispatcher: new ProxyAgent({
    uri: proxyUrl,
    keepAliveTimeout: 10,
    keepAliveMaxTimeout: 10
  })
})
```

## Docker

### Development image

Build:

```bash
docker build --target development --no-cache --tag forms-audit-api:development .
```

Run:

```bash
docker run -e PORT=3003 -p 3003:3003 forms-audit-api:development
```

### Production image

Build:

```bash
docker build --no-cache --tag forms-audit-api .
```

Run:

```bash
docker run -e PORT=3003 -p 3003:3003 forms-audit-api
```

### Docker Compose

A local environment with:

- Localstack for AWS services (S3, SQS)
- Redis
- MongoDB
- This service.
- A commented out frontend example.

```bash
docker compose up --build -d
```

### Dependabot

We have added an example dependabot configuration file to the repository. You can enable it by renaming
the [.github/example.dependabot.yml](.github/example.dependabot.yml) to `.github/dependabot.yml`

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties)

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
