open_workspace() {
    local workspace_file=$WORKSPACE/.vscode/gh-runners.code-workspace

    if ! [ -f "$workspace_file" ]; then
        echo "🔴 Missing workspace file"
        return 1
    fi

    echo "🟡 Opening workspace"
    if code "$workspace_file"; then
        echo "🟢 Workspace opened"
        return 0
    else
        echo "🔴 Failed to open workspace"
        return 1
    fi
}
