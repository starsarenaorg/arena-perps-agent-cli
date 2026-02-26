Output arena.gif

Set FontSize 16
Set Width 1200
Set Height 600
Set Theme "Dracula"

# Show current positions (should be empty or show existing)
Type "npx tsx src/arena-perps-agent.ts positions"
Sleep 500ms
Enter
Sleep 3s

# Start trade flow
Type "npx tsx src/arena-perps-agent.ts trade"
Sleep 500ms
Enter
Sleep 2s

# Select market (BTC)
Down
Sleep 200ms
Down
Sleep 200ms
Up
Sleep 200ms
Enter
Sleep 1s

# Select direction (Long)
Sleep 500ms
Enter
Sleep 1s

# Select order type (Market)
Sleep 500ms
Enter
Sleep 2s

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
Sleep 1s

# Take profit selection - choose +25%
Down
Sleep 200ms
Enter
Sleep 1s

# Stop loss selection - choose -10%
Down
Sleep 200ms
Enter
Sleep 1s

# Confirm the order
Sleep 1s
Type "y"
Sleep 500ms
Enter
Sleep 3s

# Show positions with the new order
Type "npx tsx src/arena-perps-agent.ts positions"
Sleep 500ms
Enter
Sleep 3s

# Close the position
Type "npx tsx src/arena-perps-agent.ts close"
Sleep 500ms
Enter
Sleep 2s

# Select the position (first one)
Sleep 500ms
Enter
Sleep 1s

# Close percent (100%)
Sleep 500ms
Enter
Sleep 1s

# Confirm close
Type "y"
Sleep 500ms
Enter
Sleep 3s

# Show final positions (should be empty)
Type "npx tsx src/arena-perps-agent.ts positions"
Sleep 500ms
Enter
Sleep 3s