'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand, PutCommand, UpdateCommand, DeleteCommand,
  QueryCommand, ScanCommand, BatchGetCommand, TransactWriteCommand,
} = require('@aws-sdk/lib-dynamodb');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;

let docClient;

function getRawClient() {
  if (!docClient) {
    const raw = new DynamoDBClient({});
    docClient = DynamoDBDocumentClient.from(raw, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

function getClient() {
  const client = getRawClient();
  const wrap = (Cmd) => (params) => ({ promise: () => client.send(new Cmd(params)) });
  return {
    get: wrap(GetCommand),
    put: wrap(PutCommand),
    update: wrap(UpdateCommand),
    delete: wrap(DeleteCommand),
    query: wrap(QueryCommand),
    scan: wrap(ScanCommand),
    batchGet: wrap(BatchGetCommand),
    transactWrite: (params) => ({ promise: () => client.send(new TransactWriteCommand(params)) }),
  };
}

async function withRetry(operation, retries = MAX_RETRIES) {
  try {
    return await operation();
  } catch (err) {
    const retryable = ['ProvisionedThroughputExceededException','RequestLimitExceeded','ThrottlingException'].includes(err.name);
    if (retryable && retries > 0) {
      await new Promise(r => setTimeout(r, BASE_DELAY_MS * Math.pow(2, MAX_RETRIES - retries)));
      return withRetry(operation, retries - 1);
    }
    throw err;
  }
}

module.exports = { getClient, withRetry };
