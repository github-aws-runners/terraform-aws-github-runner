import { SCALE_SET_ERROR_CODES, ScaleSetHttpError, ScaleSetProtocolError } from './errors';
import { executeRequest, HttpResult, parseJsonResponse } from './http';
import { SCALE_SET_ENDPOINT } from './endpoints';
import {
  JobAssigned,
  JobAvailable,
  JobCompleted,
  JobStarted,
  MESSAGE_TYPES,
  RunnerScaleSetMessage,
  RunnerScaleSet,
  RunnerScaleSetSession,
  RunnerScaleSetStatistic,
  ScaleSetFetch,
  ScaleSetRequestOptions,
} from './types';

export const HEADER_SCALE_SET_MAX_CAPACITY = 'X-ScaleSetMaxCapacity';

interface ActionsRequestOptions extends ScaleSetRequestOptions {
  body?: unknown;
  expectedStatuses: readonly number[];
  authorization?: string;
}

interface MessageSessionClientCreateOptions extends ScaleSetRequestOptions {
  runnerScaleSetId: number;
  owner: string;
  fetchImplementation: ScaleSetFetch;
  userAgent: () => string;
  actionsRequest: (
    method: string,
    path: string,
    options: ActionsRequestOptions,
  ) => Promise<{ result: HttpResult; url: URL }>;
}

interface RunnerScaleSetMessageResponse {
  messageId: number;
  messageType: string;
  body?: string;
  statistics?: RunnerScaleSetStatistic | null;
}

interface AcquireJobsResponse {
  count: number;
  value: number[];
}

interface JobMessageType {
  messageType?: unknown;
}

function normalizeRunnerScaleSet(scaleSet: RunnerScaleSet | null | undefined): RunnerScaleSet | null | undefined {
  if (scaleSet === null || scaleSet === undefined) {
    return scaleSet;
  }

  const wire = scaleSet as RunnerScaleSet & { RunnerSetting?: RunnerScaleSet['runnerSetting'] };
  if (wire.runnerSetting === undefined && wire.RunnerSetting !== undefined) {
    wire.runnerSetting = wire.RunnerSetting;
  }
  delete wire.RunnerSetting;
  return wire;
}

function normalizeSession(session: RunnerScaleSetSession): RunnerScaleSetSession {
  session.runnerScaleSet = normalizeRunnerScaleSet(session.runnerScaleSet);
  return session;
}

function cloneSession(session: RunnerScaleSetSession): RunnerScaleSetSession {
  return {
    ...session,
    runnerScaleSet:
      session.runnerScaleSet === undefined || session.runnerScaleSet === null
        ? session.runnerScaleSet
        : {
            ...session.runnerScaleSet,
            labels: session.runnerScaleSet.labels?.map((label) => ({ ...label })),
            runnerSetting:
              session.runnerScaleSet.runnerSetting === undefined
                ? undefined
                : { ...session.runnerScaleSet.runnerSetting },
            statistics:
              session.runnerScaleSet.statistics === undefined || session.runnerScaleSet.statistics === null
                ? session.runnerScaleSet.statistics
                : { ...session.runnerScaleSet.statistics },
          },
    statistics:
      session.statistics === undefined || session.statistics === null ? session.statistics : { ...session.statistics },
  };
}

function validateSession(session: RunnerScaleSetSession): RunnerScaleSetSession {
  if (!session.sessionId) {
    throw new ScaleSetProtocolError('message session response is missing sessionId');
  }
  if (!session.messageQueueUrl) {
    throw new ScaleSetProtocolError('message session response is missing messageQueueUrl');
  }
  if (!session.messageQueueAccessToken) {
    throw new ScaleSetProtocolError('message session response is missing messageQueueAccessToken');
  }
  return session;
}

function parseRunnerScaleSetMessage(result: HttpResult, url: URL): RunnerScaleSetMessage {
  const response = parseJsonResponse<RunnerScaleSetMessageResponse>(result, 'GET', url);
  if (response.messageType !== 'RunnerScaleSetJobMessages') {
    throw new ScaleSetProtocolError(`unsupported message type: ${response.messageType}`);
  }

  let batchedMessages: unknown[] = [];
  if (response.body) {
    try {
      const parsed = JSON.parse(response.body) as unknown;
      if (!Array.isArray(parsed)) {
        throw new TypeError('message body is not an array');
      }
      batchedMessages = parsed;
    } catch (error) {
      throw new ScaleSetProtocolError('failed to unmarshal batched runner scale set messages', {
        cause: error,
      });
    }
  }

  const message: RunnerScaleSetMessage = {
    messageId: response.messageId,
    statistics: response.statistics ?? null,
    jobAvailableMessages: [],
    jobAssignedMessages: [],
    jobStartedMessages: [],
    jobCompletedMessages: [],
  };

  for (const rawMessage of batchedMessages) {
    if (typeof rawMessage !== 'object' || rawMessage === null) {
      throw new ScaleSetProtocolError('runner scale set job message is not an object');
    }
    const messageType = (rawMessage as JobMessageType).messageType;
    switch (messageType) {
      case MESSAGE_TYPES.jobAvailable:
        message.jobAvailableMessages.push(rawMessage as JobAvailable);
        break;
      case MESSAGE_TYPES.jobAssigned:
        message.jobAssignedMessages.push(rawMessage as JobAssigned);
        break;
      case MESSAGE_TYPES.jobStarted:
        message.jobStartedMessages.push(rawMessage as JobStarted);
        break;
      case MESSAGE_TYPES.jobCompleted:
        message.jobCompletedMessages.push(rawMessage as JobCompleted);
        break;
      default:
        // The upstream client ignores unknown job message types for forward compatibility.
        break;
    }
  }

  return message;
}

/** A message queue session scoped to one runner scale set. */
export class MessageSessionClient {
  private readonly runnerScaleSetId: number;
  private readonly fetchImplementation: ScaleSetFetch;
  private readonly userAgent: () => string;
  private readonly actionsRequest: MessageSessionClientCreateOptions['actionsRequest'];
  private currentSession: RunnerScaleSetSession;
  private sessionRefresh?: Promise<void>;

  private constructor(options: MessageSessionClientCreateOptions, session: RunnerScaleSetSession) {
    this.runnerScaleSetId = options.runnerScaleSetId;
    this.fetchImplementation = options.fetchImplementation;
    this.userAgent = options.userAgent;
    this.actionsRequest = options.actionsRequest;
    this.currentSession = session;
  }

  static async create(options: MessageSessionClientCreateOptions): Promise<MessageSessionClient> {
    const path = `/${SCALE_SET_ENDPOINT}/${options.runnerScaleSetId}/sessions`;
    const { result, url } = await options.actionsRequest('POST', path, {
      body: { ownerName: options.owner },
      expectedStatuses: [200],
      signal: options.signal,
    });
    const session = validateSession(normalizeSession(parseJsonResponse<RunnerScaleSetSession>(result, 'POST', url)));
    return new MessageSessionClient(options, session);
  }

  /** A defensive snapshot of the current session and its latest statistics. */
  get session(): RunnerScaleSetSession {
    return cloneSession(this.currentSession);
  }

  getSession(): RunnerScaleSetSession {
    return this.session;
  }

  async close(options: ScaleSetRequestOptions = {}): Promise<void> {
    const path = `/${SCALE_SET_ENDPOINT}/${this.runnerScaleSetId}/sessions/${this.currentSession.sessionId}`;
    await this.actionsRequest('DELETE', path, {
      expectedStatuses: [204],
      signal: options.signal,
    });
  }

  /**
   * Long-poll for a batched scale set message. A 202 response means no message
   * is currently available and is represented as `null`.
   */
  async getMessage(
    lastMessageId: number,
    maxCapacity: number,
    options: ScaleSetRequestOptions = {},
  ): Promise<RunnerScaleSetMessage | null> {
    return this.withMessageTokenRefresh(
      (session) => this.getMessageWithSession(session, lastMessageId, maxCapacity, options),
      options,
    );
  }

  async pollMessage(
    lastMessageId: number,
    maxCapacity: number,
    options: ScaleSetRequestOptions = {},
  ): Promise<RunnerScaleSetMessage | null> {
    return this.getMessage(lastMessageId, maxCapacity, options);
  }

  /** Delete a queue message after processing it, which acknowledges the batch. */
  async deleteMessage(messageId: number, options: ScaleSetRequestOptions = {}): Promise<void> {
    await this.withMessageTokenRefresh(
      (session) => this.deleteMessageWithSession(session, messageId, options),
      options,
    );
  }

  async acknowledgeMessage(messageId: number, options: ScaleSetRequestOptions = {}): Promise<void> {
    return this.deleteMessage(messageId, options);
  }

  /** Return the authoritative subset of runner request IDs acquired by the service. */
  async acquireJobs(requestIds: number[], options: ScaleSetRequestOptions = {}): Promise<number[]> {
    return this.withMessageTokenRefresh(
      (session) => this.acquireJobsWithSession(session, requestIds, options),
      options,
    );
  }

  private async getMessageWithSession(
    session: RunnerScaleSetSession,
    lastMessageId: number,
    maxCapacity: number,
    options: ScaleSetRequestOptions,
  ): Promise<RunnerScaleSetMessage | null> {
    const url = new URL(session.messageQueueUrl);
    if (lastMessageId > 0) {
      url.searchParams.set('lastMessageId', String(lastMessageId));
    }
    const result = await executeRequest(
      this.fetchImplementation,
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json; api-version=6.0-preview',
          Authorization: `Bearer ${session.messageQueueAccessToken}`,
          'User-Agent': this.userAgent(),
          [HEADER_SCALE_SET_MAX_CAPACITY]: String(maxCapacity),
        },
        signal: options.signal,
      },
      [200, 202],
      (response) => (response.status === 401 ? SCALE_SET_ERROR_CODES.messageQueueTokenExpired : undefined),
    );

    if (result.response.status === 202) {
      return null;
    }
    return parseRunnerScaleSetMessage(result, url);
  }

  private async deleteMessageWithSession(
    session: RunnerScaleSetSession,
    messageId: number,
    options: ScaleSetRequestOptions,
  ): Promise<void> {
    const url = new URL(session.messageQueueUrl);
    const valueAfterOrigin = session.messageQueueUrl.slice(url.origin.length);
    const originalPath = valueAfterOrigin.startsWith('/') ? url.pathname : '';
    url.pathname = `${originalPath}/${messageId}`;
    await executeRequest(
      this.fetchImplementation,
      url,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.messageQueueAccessToken}`,
          'User-Agent': this.userAgent(),
        },
        signal: options.signal,
      },
      [204],
      (response) => (response.status === 401 ? SCALE_SET_ERROR_CODES.messageQueueTokenExpired : undefined),
    );
  }

  private async acquireJobsWithSession(
    session: RunnerScaleSetSession,
    requestIds: number[],
    options: ScaleSetRequestOptions,
  ): Promise<number[]> {
    const path = `/${SCALE_SET_ENDPOINT}/${this.runnerScaleSetId}/acquirejobs`;
    try {
      const { result, url } = await this.actionsRequest('POST', path, {
        body: requestIds,
        expectedStatuses: [200],
        authorization: `Bearer ${session.messageQueueAccessToken}`,
        signal: options.signal,
      });
      return parseJsonResponse<AcquireJobsResponse>(result, 'POST', url).value;
    } catch (error) {
      if (error instanceof ScaleSetHttpError && error.status === 401) {
        throw new ScaleSetHttpError({
          method: error.method,
          url: error.url,
          status: error.status,
          statusText: error.statusText,
          headers: new Headers({
            ...(error.activityId ? { ActivityId: error.activityId } : {}),
            ...(error.githubRequestId ? { 'X-GitHub-Request-Id': error.githubRequestId } : {}),
          }),
          responseBody: error.responseBody,
          code: SCALE_SET_ERROR_CODES.messageQueueTokenExpired,
          cause: error,
        });
      }
      throw error;
    }
  }

  private async withMessageTokenRefresh<T>(
    operation: (session: RunnerScaleSetSession) => Promise<T>,
    options: ScaleSetRequestOptions,
  ): Promise<T> {
    const expiredSession = this.currentSession;
    try {
      return await operation(expiredSession);
    } catch (error) {
      if (!(error instanceof ScaleSetHttpError) || error.code !== SCALE_SET_ERROR_CODES.messageQueueTokenExpired) {
        throw error;
      }
    }

    await this.refreshMessageSession(expiredSession, options);
    return operation(this.currentSession);
  }

  private async refreshMessageSession(
    expiredSession: RunnerScaleSetSession,
    options: ScaleSetRequestOptions,
  ): Promise<void> {
    if (
      this.currentSession.sessionId !== expiredSession.sessionId ||
      this.currentSession.messageQueueAccessToken !== expiredSession.messageQueueAccessToken
    ) {
      return;
    }

    if (this.sessionRefresh === undefined) {
      this.sessionRefresh = this.doRefreshMessageSession(options).finally(() => {
        this.sessionRefresh = undefined;
      });
    }
    await this.sessionRefresh;
  }

  private async doRefreshMessageSession(options: ScaleSetRequestOptions): Promise<void> {
    const path = `/${SCALE_SET_ENDPOINT}/${this.runnerScaleSetId}/sessions/${this.currentSession.sessionId}`;
    const { result, url } = await this.actionsRequest('PATCH', path, {
      expectedStatuses: [200],
      signal: options.signal,
    });
    this.currentSession = validateSession(
      normalizeSession(parseJsonResponse<RunnerScaleSetSession>(result, 'PATCH', url)),
    );
  }
}
