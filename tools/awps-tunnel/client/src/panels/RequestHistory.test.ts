import {parseRawMessage} from './RequestHistory';

test('correctly parse raw to message - json', () => {
    const raw = 'POST http://localhost:3000/eventhandler HTTP/1.1\n' +
        'ce-specversion: 1.0\n' +
        'ce-awpsversion: 1.0\n' +
        'Content-Type: application/json\n' +
        '\n' +
        '{"claims":{},"query":{"id":"aaa"},"headers":{"Connection":["Upgrade"]}}';
    const message = parseRawMessage(raw);
    expect(message).toEqual({
        headers: {
            "POST http": "//localhost:3000/eventhandler HTTP/1.1",
            "ce-specversion": "1.0",
            "ce-awpsversion": "1.0",
            "Content-Type": "application/json"
        },
        content: '{"claims":{},"query":{"id":"aaa"},"headers":{"Connection":["Upgrade"]}}',
        contentType: "application/json"
    });
});

test('correctly parse raw to message - text', () => {
    const raw = 'x-powered-by: Express\n' +
        'content-type: text/plain; charset=utf-8\n' +
        'date: Thu, 28 Sep 2023 01:46:50 GMT\n' +
        'connection: close\n' +
        '\n' +
        'Hey Hello'
    const message = parseRawMessage(raw);
    expect(message).toEqual({
        headers: {
            "x-powered-by": "Express",
            "content-type": "text/plain; charset=utf-8",
            "date": "Thu, 28 Sep 2023 01:46:50 GMT",
            "connection": "close"
        },
        content: "Hey Hello",
        contentType: "text/plain; charset=utf-8"
    })
})

test('correctly parse raw to message - rn spacing', () => {
    const raw = 'x-powered-by: Express\r\n' +
        'content-type: text/plain; charset=utf-8\r\n' +
        'date: Thu, 28 Sep 2023 01:46:50 GMT\r\n' +
        'connection: close\r\n' +
        '\r\n' +
        'Hello, this is a test with CRLF line breaks';
    const message = parseRawMessage(raw);
    expect(message).toEqual({
        headers: {
            "x-powered-by": "Express",
            "content-type": "text/plain; charset=utf-8",
            "date": "Thu, 28 Sep 2023 01:46:50 GMT",
            "connection": "close"
        },
        content: "Hello, this is a test with CRLF line breaks",
        contentType: "text/plain; charset=utf-8"
    });
});