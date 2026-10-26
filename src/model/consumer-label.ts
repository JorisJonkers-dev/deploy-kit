// The name a consumer label carries (spec/v1/16-dependencies.md#the-consumer-label):
// one surface of one Application, which every pod that reaches it carries and
// the provider's policy admits, so neither names the other's Processes.

/** The prefix of every consumer label (spec/v1/16-dependencies.md#the-consumer-label). */
export const CONSUMER_LABEL = "consumes.deploy-kit.jorisjonkers.dev/";

/** The surface `surface` of the Application `application`, as a consumer label names it. */
export const consumedOf = (application: string, surface: string): string =>
  `${application}.${surface}`;

/** The syntax and the 63 characters a label's name is held to. */
const LABEL_NAME = /^[A-Za-z0-9](?:[-_.A-Za-z0-9]{0,61}[A-Za-z0-9])?$/;

/** Whether `consumed` can be a label's name. */
export const isLabelName = (consumed: string): boolean =>
  LABEL_NAME.test(consumed);
