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