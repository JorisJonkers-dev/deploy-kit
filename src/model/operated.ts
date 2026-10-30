// What the Prometheus operator owns of the monitoring stack's Prometheus and
// Alertmanager (spec/v1/14-platform-intent.md#the-operators-objects): the
// container it runs each in, where it keeps each one's data, and how a
// declared argument maps onto its object.

/** The two kinds the operator runs from a monitoring role's Process. */
export type OperatedKind = "Prometheus" | "Alertmanager";

/** A flag as the operator's `additionalArgs` holds it: its name, without dashes, and any value. */
export interface Flag {
  readonly name: string;
  readonly value?: string;
}

interface Operator {
  /** The container the operator runs the binary in. */
  readonly container: string;
  /** The directory the operator keeps the store's data in. */
  readonly data: string;
  /** Flags the operator sets itself, which an argument may not. */
  readonly owned: readonly string[];
  /** Flags the operator's object carries as fields of its own. */
  readonly fields: readonly string[];
}

export const OPERATOR: Readonly<Record<OperatedKind, Operator>> = {
  Prometheus: {
    container: "prometheus",
    data: "/prometheus",
    owned: [
      "config.file",
      "storage.tsdb.path",
      "web.config.file",
      "web.console.libraries",
      "web.console.templates",
      "web.enable-lifecycle",
      "web.external-url",
      "web.listen-address",
      "web.route-prefix",
    ],
    fields: [
      "enable-feature",
      "storage.tsdb.retention.size",
      "storage.tsdb.retention.time",
      "web.enable-remote-write-receiver",
    ],
  },
  Alertmanager: {
    container: "alertmanager",
    data: "/alertmanager",
    owned: [
      "cluster.listen-address",
      "cluster.peer",
      "config.file",
      "storage.path",
      "web.config.file",
      "web.external-url",
      "web.listen-address",
      "web.route-prefix",
    ],
    fields: ["data.retention"],
  },
};

const FLAG = /^--?([^=-][^=]*)(?:=(.*))?$/s;

/** An argument as a flag, or undefined where it is not one. */
export function flagOf(argument: string): Flag | undefined {
  const match = FLAG.exec(argument);
  if (match === null) return undefined;
  const [, name, value] = match as unknown as [string, string, string?];
  // A flag with no value and one whose value is undefined render alike.
  // Stryker disable next-line ConditionalExpression
  return value === undefined ? { name } : { name, value };
}

/** The StatefulSet the operator runs a Process of this kind in, by the name it gives it. */
export const operatedSetOf = (kind: OperatedKind, process: string): string =>
  `${OPERATOR[kind].container}-${process}`;
