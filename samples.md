  1. POST + Response Validation                                                                                
                                                                 
  Feature: Create a Post                                                                                       
    Test POST with request body                                                                                
                                                                                                               
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

  Feature: Chained API Calls
    Use response data in the next request

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