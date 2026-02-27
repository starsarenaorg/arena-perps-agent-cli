Output arena.gif

Set FontSize 16
Set Width 1200
Set Height 600
Set Theme "Dracula"

# Deposit flow
Type "npx tsx src/arena-perps-agent.ts deposit"
Sleep 500ms
Enter
Sleep 3s

# Enter deposit amount (10 USDC)
Type "10"
Sleep 500ms
Enter
Sleep 1s

# Confirm deposit
Type "y"
Sleep 500ms
Enter
Sleep 4s

# Show initial positions (should be empty)
Type "npx tsx src/arena-perps-agent.ts positions"
Sleep 500ms
Enter
Sleep 3s

# Start trade flow
Type "npx tsx src/arena-perps-agent.ts trade"
Sleep 500ms
Enter
Sleep 3s

# Select market (BTC) - browse through markets slowly
Down
Sleep 800ms
Down
Sleep 800ms
Down
Sleep 800ms
Up
Sleep 800ms
Up
Sleep 800ms
Up
Sleep 500ms
Enter
Sleep 1.5s

# Select direction (Long)
Sleep 800ms
Down
Sleep 500ms
Up
Sleep 300ms
Enter
Sleep 1.5s

# Select order type (Market)
Sleep 800ms
Enter
Sleep 2.5s

# Enter margin (10 USDC)
Type "10"
Sleep 500ms
Enter
Sleep 500ms

# Enter leverage (15x)
Type "15"
Sleep 500ms
Enter
Sleep 1s

# Auto-calculated size shown, press Enter to accept
Sleep 800ms
Enter
Sleep 1s

# Add TP/SL? Yes
Type "y"
Sleep 500ms
Enter
Sleep 1.5s

# Take profit selection - browse options slowly
Sleep 500ms
Down
Sleep 600ms
Down
Sleep 600ms
Up
Sleep 400ms
Enter
Sleep 1.5s

# Stop loss selection - browse options slowly
Sleep 500ms
Down
Sleep 600ms
Down
Sleep 600ms
Up
Sleep 400ms
Enter
Sleep 1.5s

# Confirm the order
Sleep 1s
Type "y"
Sleep 500ms
Enter
Sleep 4s

# Show positions with the new order
Type "npx tsx src/arena-perps-agent.ts positions"
Sleep 500ms
Enter
Sleep 4s

# Close the position
Type "npx tsx src/arena-perps-agent.ts close"
Sleep 500ms
Enter
Sleep 2.5s

# Select the position (first one)
Sleep 800ms
Enter
Sleep 1.5s

# Close percent (100%)
Sleep 800ms
Enter
Sleep 1.5s

# Confirm close
Type "y"
Sleep 500ms
Enter
Sleep 4s

# Show final positions (should be empty)
Type "npx tsx src/arena-perps-agent.ts positions"
Sleep 500ms
Enter
Sleep 3s