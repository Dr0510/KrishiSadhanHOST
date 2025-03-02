import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema } from "@shared/schema";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Simple schema for login validation
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Simple schema for forgot password validation
const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Email is required").email("Please enter a valid email address"),
});

// Registration schema with password confirmation
const registrationSchema = insertUserSchema.extend({
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginData = z.infer<typeof loginSchema>;
type ForgotPasswordData = z.infer<typeof forgotPasswordSchema>;

export default function AuthPage() {
  const [_, setLocation] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form setup
  const loginForm = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const registerForm = useForm({
    resolver: zodResolver(registrationSchema),
    defaultValues: { username: "", password: "", confirmPassword: "", name: "" },
  });

  const forgotPasswordForm = useForm<ForgotPasswordData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  // Redirect if already logged in
  useEffect(() => {
    if (user) setLocation("/");
  }, [user, setLocation]);

  // Handle login submit
  const handleLogin = async (data: LoginData) => {
    try {
      await loginMutation.mutateAsync(data);
      loginForm.reset();
    } catch (error) {
      toast({
        title: t('common.error', "Error"),
        description: t('auth.loginError', "Please check your username and password and try again."),
        variant: "destructive",
      });
    }
  };

  // Handle registration submit
  const handleRegistration = async (data: any) => {
    try {
      const { confirmPassword, ...registrationData } = data;
      await registerMutation.mutateAsync(registrationData);
      toast({
        title: t('auth.registrationSuccess', "Registration Successful"),
        description: t('auth.registrationSuccessDesc', "Your account has been created successfully. You can now log in."),
      });
      registerForm.reset();
    } catch (error) {
      console.error('Registration error:', error);
      const errorMessage = error instanceof Error ? error.message : "Registration failed. Please try again.";
      toast({
        title: t('common.error', "Error"),
        description: t('auth.registrationError', errorMessage),
        variant: "destructive",
      });
    }
  };

  // Handle forgot password submit
  const handleForgotPassword = async (data: ForgotPasswordData) => {
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error();
      }

      toast({
        title: t('auth.resetEmailSent', "Email Sent"),
        description: t('auth.resetEmailSentDesc', "If an account exists with this email, you will receive instructions to reset your password."),
      });
      setIsForgotPasswordOpen(false);
      forgotPasswordForm.reset();
    } catch (error) {
      toast({
        title: t('common.error', "Error"),
        description: t('auth.resetError', "Unable to send reset instructions. Please try again later."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>

        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">{t('auth.login', 'Login')}</TabsTrigger>
                <TabsTrigger value="register">{t('auth.register', 'Register')}</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4 mt-4">
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('auth.username', 'Username')}</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder={t('auth.usernamePlaceholder', 'Enter your username')} 
                              autoComplete="username"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('auth.password', 'Password')}</FormLabel>
                          <FormControl>
                            <Input 
                              type={showPassword ? "text" : "password"} 
                              placeholder={t('auth.passwordPlaceholder', 'Enter your password')}
                              autoComplete="current-password"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {t('auth.loginButton', 'Sign In')}
                    </Button>

                    <Dialog open={isForgotPasswordOpen} onOpenChange={setIsForgotPasswordOpen}>
                      <DialogTrigger asChild>
                        <Button variant="link" className="w-full">
                          {t('auth.forgotPassword', 'Forgot Password?')}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t('auth.resetPassword', 'Reset Password')}</DialogTitle>
                          <DialogDescription>
                            {t('auth.resetPasswordDesc', 'Enter your email address to receive password reset instructions.')}
                          </DialogDescription>
                        </DialogHeader>
                        <Form {...forgotPasswordForm}>
                          <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPassword)} className="space-y-4">
                            <FormField
                              control={forgotPasswordForm.control}
                              name="email"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t('auth.email', 'Email')}</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="email"
                                      placeholder="your.email@example.com"
                                      autoComplete="email"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <Button
                              type="submit"
                              className="w-full"
                              disabled={loginMutation.isPending}
                            >
                              {loginMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              {t('auth.sendResetLink', 'Send Reset Link')}
                            </Button>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="register">
                <Form {...registerForm}>
                  <form 
                    onSubmit={registerForm.handleSubmit(handleRegistration)}
                    className="space-y-4 mt-4"
                  >
                    <FormField
                      control={registerForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('auth.fullName', 'Full Name')}</FormLabel>
                          <FormControl>
                            <Input placeholder={t('auth.fullNamePlaceholder', 'Enter your full name')} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('auth.username', 'Username')}</FormLabel>
                          <FormControl>
                            <Input placeholder={t('auth.usernamePlaceholder', 'Choose a username')} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('auth.password', 'Password')}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input 
                                type={showPassword ? "text" : "password"}
                                placeholder={t('auth.passwordPlaceholder', 'Create a password')}
                                {...field} 
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('auth.confirmPassword', 'Confirm Password')}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input 
                                type={showPassword ? "text" : "password"}
                                placeholder={t('auth.confirmPasswordPlaceholder', 'Confirm your password')}
                                {...field} 
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {t('auth.registerButton', 'Create Account')}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div 
        className="hidden md:flex flex-col justify-center p-8 bg-cover bg-center text-white"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('https://images.unsplash.com/photo-1444858291040-58f756a3bdd6')`,
        }}
      >
        <div className="max-w-xl">
          <h1 className="text-4xl font-bold mb-4">
            {t('home.title', 'Agricultural Equipment Rental Platform')}
          </h1>
          <p className="text-lg opacity-90">
            {t('home.description', 'Connect with equipment owners and find the machinery you need for your farming operations.')}
          </p>
        </div>
      </div>
    </div>
  );
}