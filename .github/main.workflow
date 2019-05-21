workflow "Run Tests" {
  on = "push"
  resolves = ["npm test (8)", "npm test (10)", "npm test (latest)"]
}

# node@8
action "npm ci (8)" {
  uses = "docker://node:8-alpine"
  runs = "npm"
  args = "ci"
}

action "npm test (8)" {
  needs = ["npm ci (8)"]
  uses = "docker://node:8-alpine"
  runs = "npm"
  args = "test"
}

# node@10
action "npm ci (10)" {
  uses = "docker://node:10-alpine"
  runs = "npm"
  args = "ci"
}

action "npm test (10)" {
  needs = ["npm ci (10)"]
  uses = "docker://node:10-alpine"
  runs = "npm"
  args = "test"
}

# node@latest
action "npm ci (latest)" {
  uses = "docker://node:alpine"
  runs = "npm"
  args = "ci"
}

action "npm test (latest)" {
  needs = ["npm ci (latest)"]
  uses = "docker://node:alpine"
  runs = "npm"
  args = "test"
}
