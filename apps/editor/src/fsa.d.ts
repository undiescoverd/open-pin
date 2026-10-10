/* The slice of the File System Access API we use. Chromium has it; the rest of the app checks before calling. */
interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
}
interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[];
  multiple?: boolean;
}
interface DirectoryPickerOptions {
  /** remembers the last folder per id */
  id?: string;
  mode?: 'read' | 'readwrite';
}
interface Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
}
