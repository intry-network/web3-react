import { ConnectorUpdate } from '@web3-react/types'
import { AbstractConnector } from '@web3-react/abstract-connector'
import warning from 'tiny-warning'
import IntrySdk, { IntryInitOptions } from "@intry/sdk"

import { SendReturnResult, SendReturn } from './types'

function parseSendReturn(sendReturn: SendReturnResult | SendReturn): any {
  return sendReturn.hasOwnProperty('result') ? sendReturn.result : sendReturn
}

export class UserRejectedRequestError extends Error {
  public constructor() {
    super()
    this.name = this.constructor.name
    this.message = 'The user rejected the request.'
  }
}

export class IntryConnector extends AbstractConnector {
  intrySdk: any;

  initOptions: IntryInitOptions;

  constructor(_initOptions: IntryInitOptions) {
    super({ supportedChainIds: [137] })

    this.initOptions = _initOptions
    this.intrySdk = new IntrySdk();
  }

  public async activate(): Promise<ConnectorUpdate> {
    if (!this.intrySdk.initialized) {
        await this.intrySdk.init(this.initOptions);
    }

    let account
    try {
      account = await this.intrySdk.enable().then(
        (sendReturn: any) => parseSendReturn(sendReturn)[0]
      )
    } catch (error) {
      if ((error as any).code === 4001) {
        throw new UserRejectedRequestError()
      }
      warning(false, 'eth_requestAccounts was unsuccessful, falling back to enable')
    }

    console.log({ account });

    return { provider: this.intrySdk, ...(account ? { account } : {}) }
  }

  public async getProvider(): Promise<any> {
    console.log("GET PROVIDER CALLED");
    return this.intrySdk;
  }

  public async getChainId(): Promise<number | string> {
    let chainId
    try {
      chainId = await this.intrySdk.request({ method: 'eth_chainId' }).then(parseSendReturn)
    } catch (e) {
      console.log("ETH CHAIN ID UNSUCCESSFUL", e);
      warning(false, 'eth_chainId was unsuccessful, falling back to net_version')
    }

    if (!chainId) {
      try {
        chainId = await this.intrySdk.request({ method: 'net_version' }).then(parseSendReturn)
      } catch {
        warning(false, 'net_version was unsuccessful, falling back to net version v2')
      }
    }

    if (!chainId) {
      try {
        chainId = parseSendReturn(await this.intrySdk.request({ method: 'net_version' }))
      } catch {
        warning(false, 'net_version v2 was unsuccessful, falling back to manual matches and static properties')
      }
    }
    console.log("CHAIN ID", chainId)

    return chainId
  }

  public async getAccount(): Promise<null | string> {
    let account
    try {
      account = await this.intrySdk.request({ method: 'eth_accounts' }).then((sendReturn: any) => parseSendReturn(sendReturn)[0])
    } catch {
      warning(false, 'eth_accounts was unsuccessful, falling back to enable')
    }

    if (!account) {
      try {
        account = await this.intrySdk.enable().then((sendReturn: any) => parseSendReturn(sendReturn)[0])
      } catch {
        warning(false, 'enable was unsuccessful, falling back to eth_accounts v2')
      }
    }

    if (!account) {
      account = parseSendReturn(this.intrySdk.request({ method: 'eth_accounts' }))[0]
    }

    console.log("ACCOUNT: ", account)

    return account
  }

  public deactivate() {
    this.intrySdk.close();
    // this.intrySdk.closeAndRemove();
  }

  public async isAuthorized(): Promise<boolean> {
    try {
      return await this.intrySdk.request({ method: 'eth_accounts' }).then((sendReturn: any) => {
        if (parseSendReturn(sendReturn).length > 0) {
          return true
        } else {
          return false
        }
      })
    } catch {
      return false
    }
  }
}
