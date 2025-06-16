import { Model } from 'json-joy/es2020/json-crdt';

// Class to manage Undo/Redo operations on the diagram model
class UndoRedoManager {
    private model: Model;
    private undoStack: any[] = [];
    private redoStack: any[] = [];
    private isUndoRedoOperation = false;

    constructor(model: Model) {
        this.model = model;
    }

    /**
     * Records a change in the undo stack.
     * Clears the redo stack when a new change is recorded.
     */
    public recordChange(patch: any) {
        // Skip recording if this change came from undo/redo
        if (this.isUndoRedoOperation) return;

        this.undoStack.push(patch);
        this.redoStack = []; // Clear redo stack on new action
    }

    /**
     * Undoes the last recorded change.
     * Applies an inverse patch and stores the original change in the redo stack.
     */
    public undo() {
        if (this.undoStack.length === 0) return null;

        const lastPatch = this.undoStack.pop();
        const inversePatch = this.createInversePatch(lastPatch);

        this.isUndoRedoOperation = true;
        this.applyInversePatch(inversePatch);
        this.redoStack.push(lastPatch);
        this.isUndoRedoOperation = false;

        return inversePatch;
    }

    /**
     * Redoes the last undone change.
     * Applies the patch again and stores it back in the undo stack.
     */
    public redo() {
        if (this.redoStack.length === 0) return null;

        const redoPatch = this.redoStack.pop();

        this.isUndoRedoOperation = true;
        this.applyPatch(redoPatch);
        this.undoStack.push(redoPatch);
        this.isUndoRedoOperation = false;

        return redoPatch;
    }

    /**
     * Creates an inverse patch from a given patch.
     * Only supports "update" type for now.
     */
    private createInversePatch(patch: any) {
        if (patch.type === 'update') {
            return {
                type: 'update',
                data: {
                    nodes: patch.oldData.nodes,
                    edges: patch.oldData.edges,
                },
                oldData: {
                    nodes: patch.data.nodes,
                    edges: patch.data.edges,
                },
            };
        }

        // Support for additional patch types can be added here
        return null;
    }

    /**
     * Applies an inverse patch to the model.
     */
    private applyInversePatch(inversePatch: any) {
        if (!inversePatch) return;
        this.model.api.root(inversePatch.data);
    }

    /**
     * Applies a patch to the model.
     */
    private applyPatch(patch: any) {
        if (!patch) return;
        this.model.api.root(patch.data);
    }

    /**
     * Returns the number of undoable changes.
     */
    public getUndoStackSize(): number {
        return this.undoStack.length;
    }

    /**
     * Returns the number of redoable changes.
     */
    public getRedoStackSize(): number {
        return this.redoStack.length;
    }
}

export { UndoRedoManager };
