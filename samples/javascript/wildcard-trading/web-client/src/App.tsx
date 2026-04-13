import AccountContainer from "./components/account-container";
import BrowserContainer from "./components/browser-container";
import TeamMember from "./components/team-member";
import AlertsPanel from "./components/alerts-panel";
import { WebPubSubProvider } from "./hooks/wps-provider";

const ACCOUNTS = [
  { accountId: "XN41212", memberIDs: ["maya", "james"] },
  { accountId: "YK38293", memberIDs: ["sophie", "robert"] },
];

function App() {
  return (
    <WebPubSubProvider>
      <div className="h-screen w-screen flex flex-col bg-gray-50">
        <div className="flex-2">
          <div className="flex flex-col h-full p-3 gap-y-1">
            <div className="flex-1">
              <AccountContainer header="Team leader">
                <BrowserContainer wide>
                  <TeamMember leader userId="william" />
                </BrowserContainer>
              </AccountContainer>
            </div>
            <div className="flex-none">
              <div className="flex justify-center h-6">
                <div className="bg-gray-300 w-px h-full"></div>
              </div>
              <div className="flex justify-center">
                <div className="bg-gray-300 h-px w-1/2"></div>
              </div>
              <div className="flex justify-around items-center px h-6">
                <div className="bg-gray-300 w-px h-full"></div>
                <div className="bg-gray-300 w-px h-full"></div>
              </div>
            </div>
            <div className="flex-1 flex justify-between gap-x-4">
              {ACCOUNTS.map((acc) => (
                <AccountContainer
                  key={acc.accountId}
                  header={
                    <div>
                      Trading account -{" "}
                      <span className="tabular-nums font-mono tracking-wider">
                        {acc.accountId}
                      </span>
                    </div>
                  }
                >
                  {acc.memberIDs.map((member) => (
                    <BrowserContainer key={member} wide>
                      <TeamMember userId={member} accountId={acc.accountId} />
                    </BrowserContainer>
                  ))}
                </AccountContainer>
              ))}
            </div>
          </div>
        </div>
        <AlertsPanel />
      </div>
    </WebPubSubProvider>
  );
}

export default App;
