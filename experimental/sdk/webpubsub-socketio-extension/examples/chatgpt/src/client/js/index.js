import '../css/style.css';
import React, { Component, Fragment } from 'react';
import ReactDOM from 'react-dom/client';
import cx from 'classnames';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism/index.js';
import AnimateHeight from 'react-animate-height';
import { io } from 'socket.io-client';

class App extends Component {
  defaultSystemMessage = 'You are an AI assistant that helps people find information.';

  newChat = {
    name: 'New chat',
    systemMessage: this.defaultSystemMessage
  };

  messages = React.createRef();

  draft = React.createRef();

  systemMessage = React.createRef();

  state = {
    sessions: [],
    current: this.newChat,
    editingSession: undefined,
    editSystemMessage: false,
    draftSystemMessage: '',
    showSessions: false,
    messages: [],
    input: ''
  };

  constructor(props) {
    super(props);
    //this.setupHttpTransport();
    this.setupWebSocketTransport();
  }

  async setupWebSocketTransport() {
    var endpoint = "";
    var negotiateResponse = await fetch(`/socket.io/negotiate`);
    if (!negotiateResponse.ok) {
      console.log("Failed to negotiate, status code =", negotiateResponse.status);
      return ;
    }
    negotiateResponse = await negotiateResponse.json();

    this.socket = io(negotiateResponse["endpoint"], {
      path: negotiateResponse["path"],
    })
      .on('message', c => {
        let m = this.state.messages[this.state.messages.length - 1];
        if (m.from !== 'ChatGPT') this.state.messages.push(m = { from: 'ChatGPT', content: '', date: new Date() });
        m.content += c;
        this.setState({});
      })
      .on('error', m => {
        this.state.messages.push({ from: 'System', content: m });
        this.setState({});
      });
    this.sendMessage = (id, input) => this.socket.emit('message', id, input);
  }

  async switchSession(session) {
    if (session.id) {
      let res = await fetch(`/chat/${session.id}/messages`);
      let history = await res.json();
      this.setState({
        current: session,
        editingSession: undefined,
        showSessions: false,
        messages: history.map(m => ({
          from: m.role === 'user' ? 'me' : 'ChatGPT',
          content: m.content,
          date: new Date(m.date)
        }))
      });
    } else this.setState({
      current: this.newChat,
      editingSession: undefined,
      showSessions: false,
      messages: []
    });
  }

  async send() {
    let input = this.state.input;
    if (input) {
      this.state.messages.push({ from: 'me', content: this.state.input, date: new Date() });
      this.setState({ input: '' });
      let current = this.state.current;
      if (!current.id) {
        let res = await fetch(`/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemMessage: current.systemMessage, nameHint: input })
        });
        current = await res.json();
        this.state.sessions.splice(0, 0, current);
        this.setState({ current: current });
      }

      await this.sendMessage(current.id, input);
    }
  }

  async updateSession() {
    let session = this.state.editingSession?.session;
    let name = this.state.editingSession?.name;
    if (session && name) {
      await fetch(`/chat/${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
      });
      session.name = name;
      this.setState({ editingSession: undefined });
    }
  }

  async deleteSession() {
    let session = this.state.editingSession?.session;
    if (session) {
      await fetch(`/chat/${session.id}`, { method: 'DELETE' });
      this.state.sessions = this.state.sessions.filter(s => s.id !== session.id);
      if (session === this.state.current) this.switchSession(this.state.sessions[0] || this.newChat);
      else this.setState({});
    }
  }

  updateSystemMessage() {
    this.state.current.systemMessage = this.state.draftSystemMessage;
    this.setState({ editSystemMessage: false });
  }

  renderMarkdown(content) {
    return (
      <ReactMarkdown
        children={content}
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline ? <SyntaxHighlighter {...props} children={String(children).replace(/\n$/, '')} style={vscDarkPlus} language={match?.[1]} PreTag="div" />
              : <code {...props} className={className}> {children}</code>;
          }
        }}
      />
    );
  }

  getDate(date) {
    let t = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    let d = Math.floor(date.valueOf() / (24 * 3600 * 1000));
    let n = Math.floor(new Date().valueOf() / (24 * 3600 * 1000));
    if (n !== d) t = `${date.getMonth() + 1}/${date.getDate()} ${t}`;
    return t;
  }

  autoHeight(element) {
    element.style.height = "5px";
    element.style.height = element.scrollHeight + "px";
  }

  async componentDidMount() {
    let res = await fetch('/chat');
    this.setState({ sessions: (await res.json()).sort((x, y) => y.createdAt - x.createdAt) });
  }

  componentDidUpdate(prevProps, prevState) {
    let m = this.messages.current;
    if (m) m.scrollTo(0, m.scrollHeight);
    if (prevState.current !== this.state.current) this.draft.current?.focus();
    if (!prevState.editSystemMessage && this.state.editSystemMessage && this.systemMessage.current) this.autoHeight(this.systemMessage.current);
  }

  renderSession(session, key) {
    let inEdit = this.state.editingSession?.session === session;
    let updating = this.state.editingSession?.action === 'update';
    return (
      <div key={key} className={cx('bg-light', 'session', { 'current-session': session === this.state.current })} onClick={() => { if (!inEdit) this.switchSession(session) }}>
        <div className="limit-width session-content">
          {inEdit ?
            <Fragment>
              {updating ?
                <input type="text" autoFocus placeholder="Name the chat..." className="form-control update-session-input" value={this.state.editingSession.name}
                  onClick={e => e.stopPropagation()}
                  onChange={e => { this.state.editingSession.name = e.target.value; this.setState({}); }}
                  onKeyDown={e => { if (e.key === 'Enter') this.updateSession(); }} />
                :
                <div className="delete-session">{`Delete '${session.name}'?`}</div>
              }
              <button className="btn yes-button borderless-button" type="button" disabled={updating && !this.state.editingSession?.name} onClick={() => updating ? this.updateSession() : this.deleteSession()}>
                <i className="bi bi-check fs-4" />
              </button>
              <button className="btn borderless-button" type="button" onClick={() => this.setState({ editingSession: undefined })}>
                <i className="bi bi-x fs-4" />
              </button>
            </Fragment>
            :
            <Fragment>
              <div>
                <i className={cx('bi', 'me-2', session.id ? 'bi-chat-square' : 'bi-plus-lg')} />
                <span>{session.name}</span>
              </div>
              {session.id &&
                <div>
                  <i className="bi bi-pencil-square me-2 floating-button" onClick={e => { this.setState({ editingSession: { session: session, action: 'update', name: session.name } }); e.stopPropagation(); }} />
                  <i className="bi bi-trash floating-button" onClick={e => { this.setState({ editingSession: { session: session, action: 'delete' } }); e.stopPropagation(); }} />
                </div>
              }
            </Fragment>
          }
        </div>
      </div>
    );
  }

  render() {
    let messages = this.state.messages;
    if (messages.length > 0 && this.state.current.systemMessage) messages = [{ from: 'System', content: this.state.current.systemMessage }].concat(messages);
    return (
      <Fragment>
        <nav className="navbar navbar-expand bg-light">
          <div className="container-fluid">
            <div className="limit-width session-title">
              <div className="session-title-content fs-5 fw-bold" onClick={() => this.setState({ showSessions: !this.state.showSessions, editingSession: undefined })}>
                <span className="me-2">{this.state.current.name}</span>
                <i className="bi bi-caret-down-fill fs-6" />
              </div>
            </div>
          </div>
        </nav>
        <div className="sessions">
          <AnimateHeight duration={200} height={this.state.showSessions ? 'auto' : 0} easing="ease-in-out">
            {[this.newChat].concat(this.state.sessions).map((s, i) => this.renderSession(s, i))}
          </AnimateHeight>
        </div>
        <div className="messages pt-3 limit-width" ref={this.messages}>
          {messages.length > 0 ?
            messages.map((m, i) =>
              <div key={i} className={cx({ 'local-message': m.from === 'me' })}>
                <div className="message mb-4 p-3">
                  <div className="message-header mb-1">{m.from !== 'me' ? m.from : ''} {m.date && this.getDate(m.date)}</div>
                  <div className="message-content">{this.renderMarkdown(m.content)}</div>
                </div>
              </div>
            ) :
            <div className="welcome-window">
              <div className="welcome-message p-4">
                <h5 className="text-center mb-4">ChatGPT</h5>
                <div className="mb-3">Start chatting with ChatGPT by entering your questions. You can also customize your chat by editing the system message below.</div>
                <h6 className="mb-3">
                  System message
                  {!this.state.editSystemMessage &&
                    <Fragment>
                      <i className="bi bi-pencil-square mx-2 floating-button" onClick={() => this.setState({ editSystemMessage: true, draftSystemMessage: this.state.current.systemMessage })} />
                      {this.state.current.systemMessage !== this.defaultSystemMessage &&
                        <i className="bi bi-arrow-counterclockwise floating-button" onClick={() => { this.state.current.systemMessage = this.defaultSystemMessage; this.setState({}); }} />
                      }
                    </Fragment>
                  }
                </h6>
                {this.state.editSystemMessage ?
                  <textarea ref={this.systemMessage} className="form-control system-message-input" placeholder="Input system message" autoFocus value={this.state.draftSystemMessage}
                    onChange={e => {
                      this.setState({ draftSystemMessage: e.target.value });
                      this.autoHeight(e.target);
                    }}
                    onKeyDown={e => {
                      switch (e.key) {
                        case 'Enter': this.updateSystemMessage(); break;
                        case 'Escape': this.setState({ editSystemMessage: false }); break;
                      }
                    }} />
                  :
                  <div className="system-message">{this.state.current.systemMessage || 'None'}</div>
                }
              </div>
            </div>
          }
        </div>
        <div className="input-box limit-width">
          <input type="text" ref={this.draft} autoFocus placeholder="Send a message..." className="form-control message-input" value={this.state.input}
            onChange={e => this.setState({ input: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') this.send(); }} />
          <button className="btn send-button borderless-button" type="button" disabled={!this.state.input}
            onClick={() => this.send()}>
            <i className="bi bi-send" />
          </button>
        </div>
      </Fragment>
    );
  }
}

let element = document.querySelector('#app');
let root = ReactDOM.createRoot(element);
root.render(<App />);