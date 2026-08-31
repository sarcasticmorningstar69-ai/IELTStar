import { WHEEL_TOPICS_A } from "./generated/wheel-topics-a";
import { WHEEL_TOPICS_B } from "./generated/wheel-topics-b";
import { WHEEL_TOPICS_C } from "./generated/wheel-topics-c";

export interface WheelTopic {
  id: string;
  category: string;
  prompt: string;
}

export const WHEEL_TOPICS: WheelTopic[] = [
  ...WHEEL_TOPICS_A,
  ...WHEEL_TOPICS_B,
  ...WHEEL_TOPICS_C,
];

export const WHEEL_TOPIC_COUNT = WHEEL_TOPICS.length;

export function wrapIndex(index: number, length = WHEEL_TOPIC_COUNT): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

export function eligibleWheelTopics(excludedIds: string[] | undefined): WheelTopic[] {
  const blocked = new Set(excludedIds ?? []);
  if (!blocked.size) return WHEEL_TOPICS;
  return WHEEL_TOPICS.filter((topic) => !blocked.has(topic.id));
}

export function randomEligibleWheelTopic(
  excludedIds: string[] | undefined,
  avoidId?: string
): WheelTopic {
  const pool = eligibleWheelTopics(excludedIds).filter((topic) => topic.id !== avoidId);
  const source = pool.length ? pool : eligibleWheelTopics(excludedIds);
  const list = source.length ? source : WHEEL_TOPICS;
  return list[Math.floor(Math.random() * list.length)];
}

export function wheelTopicIndex(id: string): number {
  const i = WHEEL_TOPICS.findIndex((topic) => topic.id === id);
  return i < 0 ? 0 : i;
}
