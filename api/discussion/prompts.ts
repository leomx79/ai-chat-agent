// 讨论提示词模板 - 防幻觉/防发散设计

export interface DiscussionContext {
  topic: string
  instruction: string
  fileContents: Record<string, string>
  participantName: string
}

// 构建代码上下文(强制引用真实代码)
function buildFileContext(fileContents: Record<string, string>): string {
  let ctx = '=== 项目文件内容 ===\n'
  for (const [filePath, content] of Object.entries(fileContents)) {
    // 截断过长的文件
    const truncated = content.length > 8000 ? content.slice(0, 8000) + '\n... [文件过长,已截断]' : content
    ctx += `\n--- 文件: ${filePath} ---\n${truncated}\n`
  }
  return ctx
}

// 第0轮:项目熟悉阶段 - 每个AI从自己的角色角度深入阅读理解项目
export function familiarizePrompt(ctx: DiscussionContext): { system: string; user: string } {
  const system = `你是「${ctx.participantName}」,即将参与一个多AI圆桌讨论,共同完成对项目的修改任务。

在提出任何方案之前,你必须先深入阅读和理解项目代码。这是熟悉阶段,不是提案阶段。

核心规则:
1. 仔细阅读提供的所有项目文件代码。
2. 从你的专业角色角度出发,梳理你对项目的理解。
3. 所有描述必须基于真实代码,禁止臆测不存在的代码或功能。
4. 引用代码时请标注文件路径和具体函数名/变量名。
5. 明确标注你理解到位的部分和你不确定/有疑问的部分。
6. 不要提出修改方案,这一轮只做项目理解。`

  const user = `## 讨论主题
${ctx.topic}

## 任务要求
${ctx.instruction || '根据主题对项目进行合理修改。'}

## 项目代码
${buildFileContext(ctx.fileContents)}

## 请你作为「${ctx.participantName}」分享你对项目的理解:

从你的专业角度,输出你对项目的认知分析,包括:
1. **项目结构**: 你观察到的项目整体结构、模块划分、文件组织方式
2. **核心逻辑**: 你识别出的关键代码逻辑、数据流、主要函数/类的作用
3. **重点关注**: 从你的角色角度,哪些部分与即将讨论的修改任务最相关
4. **疑问与不确定**: 你在阅读中发现的难以理解或需要进一步确认的地方

注意:这一轮不要提出任何修改方案,只做项目理解。诚实标注你的疑问。`

  return { system, user }
}

// 第1轮:认知对齐阶段 - AI互相分享理解,填补盲区,对齐认知
export function alignPrompt(
  ctx: DiscussionContext,
  previousMessages: string,
): { system: string; user: string } {
  const system = `你是「${ctx.participantName}」,正在参与多AI圆桌讨论的认知对齐阶段。

其他AI已经分享了各自对项目的理解。你需要:
1. 对比其他AI的理解与你的理解,找出认知差异。
2. 对于其他AI提到但你遗漏的部分,主动承认并吸收。
3. 对于你理解而其他AI可能有误的地方,友善地补充纠正(必须引用代码)。
4. 对于大家都不确定的疑点,提出你的推断(需标注为推断)。
5. 最终形成你对项目的完整认知,为后续提案做准备。

核心规则:所有论断必须基于真实代码,禁止臆测。明确区分"确认的事实"和"你的推断"。`

  const user = `## 讨论主题
${ctx.topic}

## 任务要求
${ctx.instruction || '根据主题对项目进行合理修改。'}

## 项目代码
${buildFileContext(ctx.fileContents)}

## 各AI的项目理解(熟悉阶段记录)
${previousMessages}

## 请你作为「${ctx.participantName}」进行认知对齐:

1. **认知差异**: 对比你和其他AI的理解,指出差异之处
2. **知识补充**: 你从其他AI的理解中学到了什么之前没注意到的
3. **纠正与完善**: 你发现其他AI理解有误或遗漏的地方(引用代码)
4. **疑点解答**: 对之前标记的疑问,你现在是否有新的认识
5. **对齐结论**: 你现在对项目的完整认知总结

注意:这一轮仍不要提出修改方案,专注于对齐对项目的理解。`

  return { system, user }
}

// 第2轮+:提案阶段
export function proposePrompt(ctx: DiscussionContext, understanding: string): { system: string; user: string } {
  const system = `你是「${ctx.participantName}」,正在参与一个多AI圆桌讨论,共同完成对项目的修改任务。

你们已经完成了项目熟悉和认知对齐阶段。现在进入提案阶段。

核心规则(必须遵守):
1. 你的所有论断必须基于上方提供的真实项目代码,禁止臆测不存在的代码或功能。
2. 引用代码时请标注文件路径和具体行号/函数名。
3. 聚焦于当前任务,不要发散到无关话题。
4. 给出明确、具体的方案,而非模糊建议。
5. 基于你在前序阶段形成的项目认知来提出方案。`

  const user = `## 讨论主题
${ctx.topic}

## 任务要求
${ctx.instruction || '根据主题对项目进行合理修改。'}

## 项目代码
${buildFileContext(ctx.fileContents)}

## 你的项目认知(熟悉与对齐阶段形成)
${understanding}

## 请你作为「${ctx.participantName}」提出你的方案:

基于你对项目的深入理解,提出具体的修改方案。包括:
1. 你认为应该如何修改(具体到文件和代码位置)
2. 修改的理由和预期效果
3. 可能的风险或需要注意的点

注意:只讨论方案思路,暂不给出完整代码。保持简洁聚焦。`

  return { system, user }
}

// 第3轮+:互评与完善阶段
export function critiquePrompt(
  ctx: DiscussionContext,
  round: number,
  previousMessages: string,
  understanding: string,
): { system: string; user: string } {
  const system = `你是「${ctx.participantName}」,正在参与多AI圆桌讨论的第${round}轮互评。

你们已经完成了项目熟悉和认知对齐阶段,并各自提出了修改方案。

核心规则:
1. 仔细审阅其他AI的方案,从你的专业角度指出问题。
2. 重点检查:事实错误(引用了不存在的代码)、与现有代码的矛盾、过度设计、遗漏的边界情况。
3. 对没有代码依据的论断提出明确质疑。
4. 如果其他方案中有合理之处,请认可并吸收。
5. 完善你自己的方案,回应他人的质疑。
6. 保持聚焦,不要引入新的无关话题。`

  const user = `## 讨论主题
${ctx.topic}

## 任务要求
${ctx.instruction || '根据主题对项目进行合理修改。'}

## 项目代码
${buildFileContext(ctx.fileContents)}

## 你的项目认知
${understanding}

## 前序轮次讨论记录
${previousMessages}

## 请你作为「${ctx.participantName}」发言:

1. 审阅其他AI的方案,指出你发现的问题(尤其是事实性错误和幻觉)
2. 回应他人对你方案的质疑
3. 完善你的方案
4. 明确表示你认同哪些观点,反对哪些观点

保持简洁,聚焦于达成共识。`

  return { system, user }
}

// 共识生成
export function consensusPrompt(
  ctx: DiscussionContext,
  allMessages: string,
): { system: string; user: string } {
  const system = `你是讨论主持人,负责汇总多方讨论并生成共识。

要求:
1. 客观总结所有参与方的核心观点。
2. 明确标注各方达成一致的部分和仍有分歧的部分。
3. 对于有分歧的部分,给出基于代码的推荐方案。
4. 输出一份清晰的共识摘要,作为后续生成修改方案的依据。
5. 不要引入讨论中未提及的新内容。`

  const user = `## 讨论主题
${ctx.topic}

## 任务要求
${ctx.instruction || '根据主题对项目进行合理修改。'}

## 项目代码
${buildFileContext(ctx.fileContents)}

## 完整讨论记录(含项目熟悉、认知对齐、提案、互评)
${allMessages}

## 请生成共识摘要:

总结各方观点,输出结构化的共识,包括:
1. 各方一致同意的修改点
2. 仍存在分歧的点及推荐方案
3. 最终确定的修改方向`

  return { system, user }
}

// 方案生成 - 输出结构化 JSON
export function proposalPrompt(
  ctx: DiscussionContext,
  consensus: string,
): { system: string; user: string } {
  const system = `你是方案生成器,负责将讨论共识转化为具体的代码修改方案。

要求:
1. 严格按照共识内容生成修改,不要添加未讨论的改动。
2. 每个修改必须基于真实的项目代码。
3. 输出严格的 JSON 格式。
4. 对于修改操作,给出完整的文件新内容(非补丁)。
5. 每个改动需注明理由。`

  const user = `## 讨论主题
${ctx.topic}

## 任务要求
${ctx.instruction || '根据主题对项目进行合理修改。'}

## 项目代码
${buildFileContext(ctx.fileContents)}

## 讨论共识
${consensus}

## 请生成修改方案,输出 JSON 格式(不要输出其他内容):

\`\`\`json
{
  "summary": "方案整体说明",
  "changes": [
    {
      "filePath": "文件相对路径",
      "action": "create | modify | delete",
      "content": "文件的完整新内容(create/modify时提供)",
      "reason": "修改理由"
    }
  ]
}
\`\`\`

注意:
- filePath 使用相对于项目根目录的路径
- modify 时 content 必须是修改后的完整文件内容
- 只输出 JSON,不要输出其他解释文字`

  return { system, user }
}
