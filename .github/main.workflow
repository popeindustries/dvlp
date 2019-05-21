workflow "Run Tests" {
  on = "push"
  resolves = ["npm test (10)", "npm test (latest)"]
}

# node@8

# node@10
action "npm ci (10)" {
  uses = "docker://node:10"
  runs = "npm"
  args = "ci"
}

action "npm test (10)" {
  needs = ["npm ci (10)"]
  uses = "docker://node:10"
  runs = "npm"
  args = "test"
}

# node@latest
action "npm ci (latest)" {
  uses = "docker://node"
  runs = "npm"
  args = "ci"
}

action "npm test (latest)" {
  needs = ["npm ci (latest)"]
  uses = "docker://node"
  runs = "npm"
  args = "test"
}
