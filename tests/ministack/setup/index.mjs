const response = async () => ({ statusCode: 200, body: "ministack" });

export {
  response as adjustPool,
  response as deregisterRetry,
  response as directWebhook,
  response as dispatchToRunners,
  response as eventBridgeWebhook,
  response as handler,
  response as interruptionWarning,
  response as jobRetryCheck,
  response as scaleDownHandler,
  response as scaleUpHandler,
  response as ssmHousekeeper,
  response as termination,
};
