export const TOPIC_COLORS = [
  '#1677ff',
  '#52c41a',
  '#faad14',
  '#eb2f96',
  '#722ed1',
  '#13c2c2',
  '#fa541c',
  '#2f54eb',
  '#a0d911',
  '#f5222d',
]

export function getTopicColor(index: number): string {
  return TOPIC_COLORS[index % TOPIC_COLORS.length]
}

export function getTopicColorByMap(
  rootQuestionId: string,
  rootQuestionIds: string[]
): string {
  const index = rootQuestionIds.indexOf(rootQuestionId)
  return index >= 0 ? getTopicColor(index) : '#999'
}
