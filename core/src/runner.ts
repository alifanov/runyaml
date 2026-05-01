export type Step = {
  print?: string;
};

export type Pipeline = {
  steps?: Step[];
};

export function run(pipeline: Pipeline): void {
  for (const step of pipeline.steps ?? []) {
    if (step.print !== undefined) {
      console.log(step.print);
    }
  }
}
