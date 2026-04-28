'use strict';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function success(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function error(statusCode, message) {
  return {
    statusCode,
    headers,
    body: JSON.stringify({ error: message }),
  };
}

module.exports = { success, error };
