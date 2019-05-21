workflow "Run Tests" {
  on = "push"
  resolves = "Test Matrix"
}

action "Test Matrix" {
  uses = "actions/node-matrix@v1.0.0"

  # Specify the versions of node to test against as `args`.
  args = ["8", "10", "12"]

  # Provide a GITHUB_TOKEN so that each version's tests show up in a
  # separate check run. Without this, they'll all be included in the
  # text output of this action.
  secrets = ["GITHUB_TOKEN"]
}
