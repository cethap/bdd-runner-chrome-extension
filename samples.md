  1. POST + Response Validation                                                                  
  
  Feature: Create a Post Test POST with request body                        
    Scenario: Create a new post
      Given url 'https://jsonplaceholder.typicode.com/posts'
      And header Content-Type = 'application/json'
      And request {"title": "foo", "body": "bar", "userId": 1}
      When method POST
      Then status 201
      And match response.title == 'foo'
      And match response contains { id: #number }
      And def postId = response.id
      And print postId

  2. Chained Requests (variable reuse)

  Feature: Chained API Calls Use response data in the next request

    Scenario: Get user then get their posts
      Given url 'https://jsonplaceholder.typicode.com/users/1'
      When method GET
      Then status 200
      And def userId = response.id
      And def userName = response.name
      And print userName

      Given url 'https://jsonplaceholder.typicode.com/posts'
      And param userId = '1'
      When method GET
      Then status 200
      And match response[0] contains { userId: #number }

  3. Query Parameters

  Feature: Query Parameters
    Test filtering with params

    Scenario: Get comments for a specific post
      Given url 'https://jsonplaceholder.typicode.com/comments'
      And param postId = '1'
      When method GET
      Then status 200
      And print response

  4. PUT Update

  Feature: Update Resource
    Test PUT method

    Scenario: Update a post
      Given url 'https://jsonplaceholder.typicode.com/posts/1'
      And request {"id": 1, "title": "updated title", "body": "updated body", "userId": 1}
      When method PUT
      Then status 200
      And match response.title == 'updated title'

  5. DELETE

  Feature: Delete Resource

    Scenario: Delete a post
      Given url 'https://jsonplaceholder.typicode.com/posts/1'
      When method DELETE
      Then status 200

  6. Error Handling (expected failure)

  Feature: Error Handling
    Verify 404 behavior

    Scenario: Non-existent resource returns 404
      Given url 'https://jsonplaceholder.typicode.com/posts/99999'
      When method GET
      Then status 404

  7. Doc String Body

  Feature: Doc String Request Body

    Scenario: POST with multiline body
      Given url 'https://jsonplaceholder.typicode.com/posts'
      And header Content-Type = 'application/json'
      And request
      """
      {
        "title": "multiline test",
        "body": "This is a longer body\nwith multiple lines",
        "userId": 1
      }
      """
      When method POST
      Then status 201
      And match response.title == 'multiline test'











  1. Basic eval with assertions

  Paste this in the editor and hit Run:

  Feature: Lua Scripting

    Scenario: Inline Lua eval
      Given url 'https://jsonplaceholder.typicode.com/users'
      When method GET
      Then status 200
      And eval
      """
      local users = json.decode(response.body)
      assert(#users == 10, "Expected 10 users, got " .. #users)
      for _, user in ipairs(users) do
        assert(user.email ~= nil, "Missing email for " .. user.name)
      end
      print("Validated " .. #users .. " users")
      """

  2. def varName = eval — capture return value

  Feature: Lua Variable Capture

    Scenario: Extract data with Lua
      Given url 'https://jsonplaceholder.typicode.com/users/1'
      When method GET
      Then status 200
      And def userName = eval
      """
      local user = json.decode(response.body)
      return user.name
      """
      And print userName

  3. Lua script manager — custom steps

  1. Click the Lua button in the toolbar
  2. Click + to create a new script
  3. Name it: validators
  4. Paste this code:

  step("^validate users count (\\d+)$", function(ctx, count)
    local users = json.decode(ctx.response.body)
    local expected = tonumber(count)
    assert(#users == expected, "Expected " .. expected .. " users, got " .. #users)
    print("User count validated: " .. #users)
  end)

  5. Click Save
  6. Now use your custom step in a feature:

  Feature: Custom Lua Step

    Scenario: Use custom validator
      Given url 'https://jsonplaceholder.typicode.com/users'
      When method GET
      Then status 200
      And validate users count 10

  4. Error handling

  Feature: Lua Error Handling

    Scenario: Lua assertion failure shows in results
      Given url 'https://jsonplaceholder.typicode.com/users/1'
      When method GET
      Then status 200
      And eval
      """
      assert(false, "This should fail and show in the results panel")
      """

  5. script 'name' — run stored script

  After saving the validators script above, you can also call it directly:

    And script 'validators'

  This loads the script (registers any step() calls) and executes it.

  ---
  Start with test #1 — that's the quickest way to verify the whole pipeline: Gherkin parsing → step matching →
  Lua bridge → json.decode → assert → print → results panel.




  ── Browser UI Automation (SauceDemo) ──

  1. Successful Login

  Feature: SauceDemo Login

    Scenario: Login with standard user
      Given browser open 'https://www.saucedemo.com'
      And browser fill '#user-name' with 'standard_user'
      And browser fill '#password' with 'secret_sauce'
      And browser click '#login-button'
      Then browser text '.title' == 'Products'
      And browser screenshot
      And browser close

  2. Failed Login

  Feature: SauceDemo Login Errors

    Scenario: Login with locked out user
      Given browser open 'https://www.saucedemo.com'
      And browser fill '#user-name' with 'locked_out_user'
      And browser fill '#password' with 'secret_sauce'
      And browser click '#login-button'
      Then browser text '[data-test="error"]' contains 'locked out'
      And browser screenshot
      And browser close

  3. Add Item to Cart

  Feature: Shopping Cart

    Scenario: Add backpack to cart
      Given browser open 'https://www.saucedemo.com'
      And browser fill '#user-name' with 'standard_user'
      And browser fill '#password' with 'secret_sauce'
      And browser click '#login-button'
      And browser click '#add-to-cart-sauce-labs-backpack'
      Then browser text '.shopping_cart_badge' == '1'
      And browser screenshot
      And browser close

  4. Full Checkout Flow

  Feature: Checkout Flow

    Scenario: Purchase a product end to end
      Given browser open 'https://www.saucedemo.com'
      And browser fill '#user-name' with 'standard_user'
      And browser fill '#password' with 'secret_sauce'
      And browser click '#login-button'
      And browser click '#add-to-cart-sauce-labs-backpack'
      And browser click '.shopping_cart_link'
      Then browser text '.inventory_item_name' == 'Sauce Labs Backpack'
      And browser screenshot
      And browser click '#checkout'
      And browser fill '#first-name' with 'John'
      And browser fill '#last-name' with 'Doe'
      And browser fill '#postal-code' with '12345'
      And browser click '#continue'
      Then browser text '.inventory_item_name' == 'Sauce Labs Backpack'
      And browser screenshot
      And browser click '#finish'
      Then browser text '.complete-header' == 'Thank you for your order!'
      And browser screenshot
      And browser close

  5. Add Multiple Items and Verify Cart

  Feature: Multiple Items

    Scenario: Add two items and verify cart count
      Given browser open 'https://www.saucedemo.com'
      And browser fill '#user-name' with 'standard_user'
      And browser fill '#password' with 'secret_sauce'
      And browser click '#login-button'
      And browser click '#add-to-cart-sauce-labs-backpack'
      And browser click '#add-to-cart-sauce-labs-bike-light'
      Then browser text '.shopping_cart_badge' == '2'
      And browser click '.shopping_cart_link'
      And browser screenshot
      And browser close

  6. Remove Item from Cart

  Feature: Cart Management

    Scenario: Add and remove item
      Given browser open 'https://www.saucedemo.com'
      And browser fill '#user-name' with 'standard_user'
      And browser fill '#password' with 'secret_sauce'
      And browser click '#login-button'
      And browser click '#add-to-cart-sauce-labs-backpack'
      Then browser text '.shopping_cart_badge' == '1'
      And browser click '#remove-sauce-labs-backpack'
      Then browser not visible '.shopping_cart_badge'
      And browser screenshot
      And browser close

  7. Capture Product Name into Variable

  Feature: Variable Capture

    Scenario: Capture and print product name
      Given browser open 'https://www.saucedemo.com'
      And browser fill '#user-name' with 'standard_user'
      And browser fill '#password' with 'secret_sauce'
      And browser click '#login-button'
      And def productName = browser text '.inventory_item_name'
      And print productName
      And browser screenshot
      And browser close

  8. Sort Products

  Feature: Product Sorting

    Scenario: Sort by price low to high
      Given browser open 'https://www.saucedemo.com'
      And browser fill '#user-name' with 'standard_user'
      And browser fill '#password' with 'secret_sauce'
      And browser click '#login-button'
      And browser select '.product_sort_container' value 'lohi'
      And def firstProduct = browser text '.inventory_item_name'
      And print firstProduct
      And browser screenshot
      And browser close




  ── Browser UI Automation (Accessibility Selectors) ──

  You can use accessibility tree selectors instead of CSS selectors.
  Format: role "accessible name" — matches elements by ARIA role + name.

  Supported roles: button, textbox, link, heading, checkbox, radio,
  combobox, option, menuitem, tab, dialog, alert, img, text, StaticText

  text/StaticText use partial matching — text "Prod" finds elements containing "Prod".
  All other roles use exact matching on accessible name.

  9. Login with Accessibility Selectors

  Feature: SauceDemo Accessibility Login

    Scenario: Login using accessibility tree roles
      Given browser open 'https://www.saucedemo.com'
      And browser fill 'textbox "Username"' with 'standard_user'
      And browser fill 'textbox "Password"' with 'secret_sauce'
      And browser click 'button "Login"'
      Then browser text 'text "Products"' == 'Products'
      And browser screenshot
      And browser close

  10. Capture Text and Partial Match

  Feature: Text Capture and Search

    Scenario: Capture element text and assert with partial match
      Given browser open 'https://www.saucedemo.com'
      And browser fill 'textbox "Username"' with 'standard_user'
      And browser fill 'textbox "Password"' with 'secret_sauce'
      And browser click 'button "Login"'
      And def title = browser text 'text "Products"'
      And print title
      Then browser text 'text "Products"' contains 'Prod'
      And browser screenshot
      And browser close

  11. Click Link by Accessible Name

  Feature: Accessible Link Click

    Scenario: Click product link by name
      Given browser open 'https://www.saucedemo.com'
      And browser fill 'textbox "Username"' with 'standard_user'
      And browser fill 'textbox "Password"' with 'secret_sauce'
      And browser click 'button "Login"'
      And browser click 'link "Sauce Labs Backpack"'
      Then browser text 'text "Back to products"' contains 'Back'
      And browser screenshot
      And browser close

  12. Full Checkout with Accessibility Selectors

  Feature: Accessible Checkout Flow

    Scenario: Checkout using accessibility selectors
      Given browser open 'https://www.saucedemo.com'
      And browser fill 'textbox "Username"' with 'standard_user'
      And browser fill 'textbox "Password"' with 'secret_sauce'
      And browser click 'button "Login"'
      And browser click 'button "Add to cart"'
      And browser click 'link "1"'
      And browser click 'button "Checkout"'
      And browser fill 'textbox "First Name"' with 'John'
      And browser fill 'textbox "Last Name"' with 'Doe'
      And browser fill 'textbox "Zip/Postal Code"' with '12345'
      And browser click 'button "Continue"'
      And browser screenshot
      And browser click 'button "Finish"'
      Then browser text 'text "Thank you"' contains 'Thank you'
      And browser screenshot
      And browser close