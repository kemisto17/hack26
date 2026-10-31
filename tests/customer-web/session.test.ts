import { describe,it,expect,vi,beforeEach } from "vitest";
import { AppError } from "@/lib/api/errors";
const identity=vi.hoisted(()=>({requireActor:vi.fn(),getMe:vi.fn()}));
vi.mock("@/modules/identity/service",()=>identity);
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error(`REDIRECT:${path}`);}}));
import { requireCustomer } from "@/components/customer-web/session";
import { customerCollection,customerDetail } from "@/components/customer-web/data";
beforeEach(()=>{vi.clearAllMocks();identity.requireActor.mockResolvedValue({id:"customer",role:"customer"});identity.getMe.mockResolvedValue({id:"customer",display_name:"Fixture",role:"customer",is_active:true});});
describe("frontend guard delegates verification to D1",()=>{
 it("uses the verified actor and current profile",async()=>{const user=await requireCustomer();expect(user.id).toBe("customer");expect(identity.getMe).toHaveBeenCalledWith({id:"customer",role:"customer"});});
 it.each(["admin","internal"])("keeps %s out of the customer workspace",async role=>{identity.getMe.mockResolvedValue({id:"staff",role});await expect(requireCustomer()).rejects.toThrow("REDIRECT:/");});
 it.each(["UNAUTHENTICATED","FORBIDDEN"] as const)("redirects %s to sign in without rendering account data",async code=>{identity.requireActor.mockRejectedValue(new AppError(code,"fixture"));await expect(requireCustomer()).rejects.toThrow("REDIRECT:/login?reason=account");expect(identity.getMe).not.toHaveBeenCalled();});
 it("does not turn a connection failure into a valid customer",async()=>{identity.requireActor.mockRejectedValue(new Error("Offline"));await expect(requireCustomer()).rejects.toThrow("Offline");});
 it("unconnected records are unavailable, not empty or zero",async()=>{expect(await customerCollection("subscriptions")).toEqual({state:"unavailable"});expect(await customerDetail("invoices","id")).toEqual({state:"unavailable"});expect(identity.requireActor).toHaveBeenCalledTimes(2);});
});
