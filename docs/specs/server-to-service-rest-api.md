---
layout: docs
toc: true
group: specs
---

# Azure Web PubSub Service REST API
## Version: 2020-10-01

### Available APIs

| API | Path |
| ---- | ---------- | 
| [Broadcast content inside request body to all the connected client connections](#post-broadcast-content-inside-request-body-to-all-the-connected-client-connections) | `POST /api/:send` |
| [Send content inside request body to the specific user.](#post-send-content-inside-request-body-to-the-specific-user) | `POST /api/users/{id}/:send` |
| [Send content inside request body to the specific connection.](#post-send-content-inside-request-body-to-the-specific-connection) | `POST /api/connections/{connectionId}/:send` |
| [Send content inside request body to a group of connections.](#post-send-content-inside-request-body-to-a-group-of-connections) | `POST /api/groups/{group}/:send` |
| [Close the client connection](#delete-close-the-client-connection) | `DELETE /api/connections/{connectionId}` |
| [Add a connection to the target group.](#put-add-a-connection-to-the-target-group) | `PUT /api/groups/{group}/connections/{connectionId}` |
| [Remove a connection from the target group.](#delete-remove-a-connection-from-the-target-group) | `DELETE /api/groups/{group}/connections/{connectionId}` |
| [Add a user to the target group.](#put-add-a-user-to-the-target-group) | `PUT /api/users/{user}/groups/{group}` |
| [Remove a user from the target group.](#delete-remove-a-user-from-the-target-group) | `DELETE /api/users/{user}/groups/{group}` |
| [Remove a user from all groups.](#delete-remove-a-user-from-all-groups) | `DELETE /api/users/{user}/groups` |

<a name="post-broadcast-content-inside-request-body-to-all-the-connected-client-connections"></a>
### Broadcast content inside request body to all the connected client connections

`POST /api/:send`
##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| hub | query | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. When it is not set, it uses the default hub | No | string |
| excluded | query | Excluded connection Ids | No | [ string ] |
| api-version | query |  | No | string |
| payloadMessage | body |  | Yes | binary |

##### Responses

| Code | Description |
| ---- | ----------- |
| 202 | Success |
| default | Error response |

<a name="post-send-content-inside-request-body-to-the-specific-user"></a>
### Send content inside request body to the specific user.

`POST /api/users/{id}/:send`
##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| id | path | The user Id. | Yes | string |
| hub | query | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. When it is not set, it uses the default hub | No | string |
| api-version | query |  | No | string |
| payloadMessage | body |  | Yes | binary |

##### Responses

| Code | Description |
| ---- | ----------- |
| 202 | Success |
| default | Error response |

<a name="post-send-content-inside-request-body-to-the-specific-connection"></a>
### Send content inside request body to the specific connection.

`POST /api/connections/{connectionId}/:send`
##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| connectionId | path | The connection Id. | Yes | string |
| hub | query | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. When it is not set, it uses the default hub | No | string |
| api-version | query |  | No | string |
| payloadMessage | body |  | Yes | binary |

##### Responses

| Code | Description |
| ---- | ----------- |
| 202 | Success |
| default | Error response |

<a name="post-send-content-inside-request-body-to-a-group-of-connections"></a>
### Send content inside request body to a group of connections.

`POST /api/groups/{group}/:send`
##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| group | path | Target group name, which length should be greater than 0 and less than 1025. | Yes | string |
| hub | query | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. When it is not set, it uses the default hub | No | string |
| excluded | query | Excluded connection Ids | No | [ string ] |
| api-version | query |  | No | string |
| payloadMessage | body |  | Yes | binary |

##### Responses

| Code | Description |
| ---- | ----------- |
| 202 | Success |
| default | Error response |

<a name="delete-close-the-client-connection"></a>
### Close the client connection

`DELETE /api/connections/{connectionId}`
##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| connectionId | path | Target connection Id | Yes | string |
| hub | query | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. When it is not set, it uses the default hub | No | string |
| reason | query | The reason closing the client connection | No | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Success |
| default | Error response |



<a name="put-add-a-connection-to-the-target-group"></a>
### Add a connection to the target group.

`PUT /api/groups/{group}/connections/{connectionId}`
##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| group | path | Target group name, which length should be greater than 0 and less than 1025. | Yes | string |
| connectionId | path | Target connection Id | Yes | string |
| hub | query | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. When it is not set, it uses the default hub | No | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Success |
| 404 | Not Found |
| default | Error response |

<a name="delete-remove-a-connection-from-the-target-group"></a>
### Remove a connection from the target group.

`DELETE /api/groups/{group}/connections/{connectionId}`
##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| group | path | Target group name, which length should be greater than 0 and less than 1025. | Yes | string |
| connectionId | path | Target connection Id | Yes | string |
| hub | query | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. When it is not set, it uses the default hub | No | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Success |
| 404 | Not Found |
| default | Error response |

<a name="put-add-a-user-to-the-target-group"></a>
### Add a user to the target group.

`PUT /api/users/{user}/groups/{group}`
##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| group | path | Target group name, which length should be greater than 0 and less than 1025. | Yes | string |
| user | path | Target user Id | Yes | string |
| hub | query | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. When it is not set, it uses the default hub | No | string |
| ttl | query | Specifies the seconds that the user exists in the group. If not set, the user lives in the group forever. | No | integer |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 202 | Success |
| default | Error response |

<a name="delete-remove-a-user-from-the-target-group"></a>
### Remove a user from the target group.

`DELETE /api/users/{user}/groups/{group}`
##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| group | path | Target group name, which length should be greater than 0 and less than 1025. | Yes | string |
| user | path | Target user Id | Yes | string |
| hub | query | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. When it is not set, it uses the default hub | No | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Success |
| default | Error response |

<a name="delete-remove-a-user-from-all-groups"></a>
### Remove a user from all groups.

`DELETE /api/users/{user}/groups`
##### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| user | path | Target user Id | Yes | string |
| hub | query | Target hub name, which should start with alphabetic characters and only contain alpha-numeric characters or underscore. When it is not set, it uses the default hub | No | string |
| api-version | query |  | No | string |

##### Responses

| Code | Description |
| ---- | ----------- |
| 200 | The user is deleted |
| default | Error response |
