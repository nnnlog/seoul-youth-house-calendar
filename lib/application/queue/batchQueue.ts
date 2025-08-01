export class BatchQueue {
    private batchSize: number;
    private tasks: (() => Promise<void>)[] = [];

    constructor(batchSize: number) {
        this.batchSize = batchSize;
    }

    public addTask(task: () => Promise<any>) {
        this.tasks.push(task);
    }

    private async _run() {
        while (this.tasks.length > 0) {
            const task = this.tasks.pop()!;
            await task();
        }
    }

    public async run() {
        const tasks = [];
        for (let i = 0; i < this.batchSize; i++) {
            tasks.push(this._run());
        }
        await Promise.all(tasks);
    }
}
